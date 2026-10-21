// Run: node --test tests/ma/screen.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyFilters, buildRows, criterionScores, CRITERIA, DEFAULT_FILTERS, DEFAULT_WEIGHTS, interp, memo, metricsFor, rank, rng, run, score, sensitivity } from "../../src/lib/ma/screen.ts";
import type { Company, Dataset, Weights } from "../../src/lib/ma/screen.ts";

const cell = (value: number) => ({ value, tag: "t", accn: "a", filed: "2026-02-01", end: "2025-12-31" });
const blank = () => ({ revenue: null, operating_income: null, net_income: null, rnd: null, cfo: null, da: null, cash: null, debt: null, st_investments: null, assets: null });
type O = { rev25: number; rev22: number; op: number; cfo?: number; rnd?: number; da?: number; cash?: number; debt?: number };
function co(ticker: string, o: O): Company {
  const y25: any = { ...blank(), revenue: cell(o.rev25), operating_income: cell(o.op) };
  if (o.cfo !== undefined) y25.cfo = cell(o.cfo);
  if (o.rnd !== undefined) y25.rnd = cell(o.rnd);
  if (o.da !== undefined) y25.da = cell(o.da);
  if (o.cash !== undefined) y25.cash = cell(o.cash);
  if (o.debt !== undefined) y25.debt = cell(o.debt);
  return { ticker, name: ticker + " Inc", sic: "2834", sicDescription: "x", fiscalYearEnd: "1231", years: { "2022": { ...blank(), revenue: cell(o.rev22) }, "2025": y25 } } as Company;
}
const ds = (cs: Company[]): Dataset => ({ generated: "2026-10-20", companies: Object.fromEntries(cs.map((c) => [c.ticker, c])) });

test("interp: flat outside the anchors, linear between", () => {
  const p: [number, number][] = [[0, 0], [10, 100]];
  assert.equal(interp(-5, p), 0);
  assert.equal(interp(5, p), 50);
  assert.equal(interp(50, p), 100);
});

test("criterion scores follow the brief's anchors", () => {
  // revenue 900 is inside the 300-1500 sweet spot; CAGR (900/300)^(1/3)-1 = 44.2% (capped at 100); margin 20%; CFO margin 17.5%; net cash; R&D 20%.
  const { m } = metricsFor(co("AAA", { rev25: 900, rev22: 300, op: 180, cfo: 157.5, rnd: 180, da: 20, cash: 300, debt: 100 }));
  const s = criterionScores(m);
  assert.equal(s.scale, 100);
  assert.equal(s.growth, 100);
  assert.ok(Math.abs((s.margin as number) - 50) < 1e-9);
  assert.ok(Math.abs((s.cash as number) - 50) < 1e-9);
  assert.equal(s.leverage, 100);
  assert.equal(s.rnd, 100);
});

test("scale score is 0 at the band edge and halfway down the upper ramp", () => {
  assert.equal(interp(150, [[150, 0], [300, 100], [1500, 100], [3000, 0]]), 0);
  assert.equal(interp(2250, [[150, 0], [300, 100], [1500, 100], [3000, 0]]), 50);
});

test("leverage: net debt over EBITDA; negative EBITDA with positive net debt scores 0; net cash scores 100", () => {
  const lev = (o: O) => criterionScores(metricsFor(co("X", o)).m).leverage;
  assert.equal(lev({ rev25: 500, rev22: 400, op: 100, da: 20, debt: 480, cash: 0 }), 0); // 480 / 120 = 4.0x
  assert.equal(lev({ rev25: 500, rev22: 400, op: 100, da: 20, debt: 240, cash: 0 }), 50); // 2.0x
  assert.equal(lev({ rev25: 500, rev22: 400, op: -10, da: 5, debt: 100, cash: 0 }), 0);
  assert.equal(lev({ rev25: 500, rev22: 400, op: -10, debt: 100, cash: 300 }), 100);
});

test("missing data is flagged, never filled: no debt tag means leverage is missing", () => {
  const { m, flags, missing } = metricsFor(co("N", { rev25: 500, rev22: 400, op: 100, cfo: 120, rnd: 50, da: 10, cash: 200 }));
  assert.equal(m.leverage, null);
  assert.deepEqual(missing, ["leverage"]);
  assert.ok(flags.some((f) => f.startsWith("No debt balance found")));
});

test("filters: reasons are stated and the profit filter can be switched off", () => {
  const rows = buildRows(ds([co("OK", { rev25: 500, rev22: 400, op: 50 }), co("BIG", { rev25: 5000, rev22: 4000, op: 500 }), co("LOSS", { rev25: 500, rev22: 400, op: -5 })]));
  const { passed, excluded } = applyFilters(rows, DEFAULT_FILTERS);
  assert.deepEqual(passed.map((r) => r.ticker), ["OK"]);
  assert.equal(excluded.length, 2);
  assert.ok(excluded.find((e) => e.row.ticker === "BIG")!.reasons[0].includes("above"));
  assert.ok(excluded.find((e) => e.row.ticker === "LOSS")!.reasons[0].includes("negative"));
  assert.equal(applyFilters(rows, { ...DEFAULT_FILTERS, requireProfitable: false }).passed.length, 2);
});

test("composite: renormalize drops a missing criterion; the zero policy scores it 0", () => {
  // margin 40% and CFO margin 35% both score 100; growth, scale and R&D score 100; leverage is missing (no debt tag).
  const rows = buildRows(ds([co("N", { rev25: 900, rev22: 300, op: 360, cfo: 315, rnd: 180, da: 10, cash: 200 })]));
  const a = score(rows, DEFAULT_WEIGHTS, "renormalize")[0];
  const b = score(rows, DEFAULT_WEIGHTS, "zero")[0];
  assert.ok(Math.abs(a.score - 100) < 1e-9);
  assert.ok(Math.abs(b.score - 90) < 1e-9); // leverage carries 10 of 100 weight
  assert.ok(Math.abs(a.coverage - 0.9) < 1e-9);
});

test("composite: multiplying all weights by a constant changes nothing", () => {
  const rows = buildRows(ds([co("A", { rev25: 900, rev22: 500, op: 200, cfo: 150, rnd: 100, da: 10, cash: 100, debt: 50 }), co("B", { rev25: 400, rev22: 390, op: 40, cfo: 30, rnd: 10, da: 10, cash: 10, debt: 300 })]));
  const w3 = Object.fromEntries(CRITERIA.map((c) => [c, DEFAULT_WEIGHTS[c] * 3])) as Weights;
  const s1 = score(rows, DEFAULT_WEIGHTS);
  const s2 = score(rows, w3);
  s1.forEach((x, i) => assert.ok(Math.abs(x.score - s2[i].score) < 1e-9));
  assert.deepEqual(rank(s1).map((r) => r.ticker), rank(s2).map((r) => r.ticker));
});

test("composite is monotonic: faster growth cannot lower the score", () => {
  const mk = (rev22: number) => buildRows(ds([co("A", { rev25: 900, rev22, op: 200, cfo: 150, rnd: 100, da: 10, cash: 100, debt: 50 })]));
  assert.ok(score(mk(600), DEFAULT_WEIGHTS)[0].score >= score(mk(800), DEFAULT_WEIGHTS)[0].score);
});

test("rank: ties share a rank", () => {
  const rows = buildRows(ds([co("A", { rev25: 900, rev22: 500, op: 200 }), co("B", { rev25: 900, rev22: 500, op: 200 }), co("C", { rev25: 900, rev22: 500, op: 100 })]));
  assert.deepEqual(rank(score(rows, DEFAULT_WEIGHTS)).map((x) => x.rank), [1, 1, 3]);
});

test("rng is reproducible", () => {
  const a = rng(7);
  const b = rng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test("sensitivity: reproducible, ranks within bounds, a dominant company stays first", () => {
  const rows = buildRows(ds([
    co("TOP", { rev25: 900, rev22: 400, op: 360, cfo: 300, rnd: 150, da: 10, cash: 300, debt: 0 }),
    co("MID", { rev25: 600, rev22: 500, op: 100, cfo: 90, rnd: 60, da: 10, cash: 50, debt: 200 }),
    co("LOW", { rev25: 300, rev22: 290, op: 10, cfo: 5, rnd: 2, da: 10, cash: 5, debt: 400 }),
  ]));
  const a = sensitivity(rows, DEFAULT_WEIGHTS, { draws: 300, seed: 1 });
  assert.deepEqual(a, sensitivity(rows, DEFAULT_WEIGHTS, { draws: 300, seed: 1 }));
  assert.equal(a.perTicker.TOP.p5, 1);
  assert.equal(a.perTicker.TOP.p95, 1);
  assert.equal(a.perTicker.LOW.p5, 3);
  for (const t of Object.values(a.perTicker)) assert.ok(t.p5 >= 1 && t.p95 <= 3 && t.top5Share >= 0 && t.top5Share <= 1);
});

test("real dataset: nobody is ranked who fails a filter, and the memo states what was not assessed", () => {
  const real = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
  const o = run(real, DEFAULT_WEIGHTS, DEFAULT_FILTERS, { draws: 200 });
  assert.equal(o.passed + o.excluded.length, Object.keys(real.companies).length);
  assert.ok(o.ranked.length > 0);
  for (const r of o.ranked) {
    const m = r.s.row.metrics;
    assert.ok(m.revenue! >= 150 && m.revenue! <= 3000 && m.operatingIncome! > 0);
  }
  const text = memo(o, real, Object.keys(real.companies).length).join("\n");
  assert.match(text, /Not assessed: valuation/);
  assert.match(text, /preliminary screening only/);
});
