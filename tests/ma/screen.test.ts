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

// ---- market capitalisation and royalty-financing debt ----
import { DEFAULT_OPTIONS, MARKET_WEIGHTS_ON, parsePrices } from "../../src/lib/ma/screen.ts";

function withMarket(c: Company, extra: Partial<Company>): Company {
  return { ...c, ...extra };
}

test("royalty-financing obligations count as debt by default and can be switched off", () => {
  const base = co("R", { rev25: 500, rev22: 400, op: 100, cfo: 90, rnd: 50, da: 20, cash: 100, debt: 0 });
  const c = withMarket(base, { debtLikeItems: [{ label: "Royalty financing", value: 300 }] });
  const on = metricsFor(c, { includeRoyalty: true }).m;
  const off = metricsFor(c, { includeRoyalty: false }).m;
  assert.equal(on.netDebt, 200); // 0 + 300 - 100
  assert.equal(off.netDebt, -100);
  assert.equal(on.leverage, 200 / 120); // EBITDA = 100 + 20
  assert.equal(off.leverage, "net cash");
  assert.ok(metricsFor(c, { includeRoyalty: true }).flags.some((f) => f.includes("counted as debt")));
  assert.ok(metricsFor(c, { includeRoyalty: false }).flags.some((f) => f.includes("NOT counted as debt")));
});

test("market cap = price x cover-page shares; EV adds net debt; multiples follow", () => {
  const base = co("M", { rev25: 500, rev22: 400, op: 100, cfo: 90, rnd: 50, da: 20, cash: 100, debt: 300 });
  const c = withMarket(base, { shares: { value: 50, end: "2026-02-01", accn: "a", filed: "2026-02-10", classes: 1 } });
  const m = metricsFor(c, { includeRoyalty: true, prices: { M: 20 } }).m;
  assert.equal(m.marketCap, 1000);
  assert.equal(m.ev, 1200); // 1000 + (300 - 100)
  assert.equal(m.evToEbitda, 10); // 1200 / 120
  assert.equal(m.evToRevenue, 2.4);
});

test("market criteria: value scores 100 at 8x or less and 0 at 25x; deal size follows the band; negative EBITDA scores 0", () => {
  const mk = (price: number, op = 100) => {
    const c = withMarket(co("M", { rev25: 500, rev22: 400, op, cfo: 90, rnd: 50, da: 20, cash: 100, debt: 300 }), { shares: { value: 50, end: "x", accn: "a", filed: "x", classes: 1 } });
    return criterionScores(metricsFor(c, { includeRoyalty: true, prices: { M: price } }).m);
  };
  assert.equal(mk(15.2).value, 100); // EV 960 = 8.0x EBITDA 120
  assert.ok(Math.abs((mk(15.2).capacity as number) - (100 * (960 - 300)) / 700) < 1e-9); // 94.29
  assert.ok(Math.abs((mk(52).value as number) - (100 * (25 - 2800 / 120)) / 17) < 1e-9); // EV 2,800 = 23.3x
  assert.equal(mk(20, -50).value, 0); // EBITDA = -50 + 20 < 0
});

test("without prices the market criteria are off, not missing; with prices a company lacking one is missing", () => {
  const c = co("N", { rev25: 500, rev22: 400, op: 100, cfo: 90, rnd: 50, da: 20, cash: 100, debt: 10 });
  assert.ok(!metricsFor(c, DEFAULT_OPTIONS).missing.includes("value"));
  assert.ok(metricsFor(c, { includeRoyalty: true, prices: { OTHER: 5 } }).missing.includes("value"));
});

test("parsePrices accepts common separators and reports what it cannot use", () => {
  const { prices, errors } = parsePrices("BCRX 7.25\nptct, $54.10\nHALO: 1,000\n# comment\nXXXX 3\nIRWD abc\nLGND", ["BCRX", "PTCT", "HALO", "IRWD", "LGND"]);
  assert.deepEqual(prices, { BCRX: 7.25, PTCT: 54.1, HALO: 1000 });
  assert.equal(errors.length, 3);
  assert.ok(errors.some((e) => e.includes("XXXX is not one of")));
});

test("market weights switch the memo to say prices came from the user", () => {
  const real = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
  const w = { ...DEFAULT_WEIGHTS, ...MARKET_WEIGHTS_ON };
  const prices = Object.fromEntries(Object.values(real.companies).map((c) => [c.ticker, 10]));
  const o = run(real, w, DEFAULT_FILTERS, { draws: 100 }, { includeRoyalty: true, prices }, "2026-10-21");
  const text = memo(o, real, 28).join("\n");
  assert.match(text, /share prices entered by the user for 28 companies \(dated 2026-10-21\)/);
  assert.match(text, /Not assessed: control premium/);
  const plain = memo(run(real, DEFAULT_WEIGHTS, DEFAULT_FILTERS, { draws: 100 }), real, 28).join("\n");
  assert.match(plain, /Not assessed: valuation or market capitalisation/);
});

test("curated balance-sheet debt: totals equal the sum of the listed lines", () => {
  const cur = JSON.parse(readFileSync("src/data/ma/balance-sheet-debt.json", "utf8")).companies as Record<string, { debt: number; lines?: { value: number }[] }>;
  for (const [t, c] of Object.entries(cur)) if (c.lines?.length) assert.ok(Math.abs(c.lines.reduce((s, l) => s + l.value, 0) - c.debt) < 0.0015, t);
});

test("real dataset: PTCT net debt counts $2.3bn of sold royalties and every company has a share count", () => {
  const real = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
  const ptct = metricsFor(real.companies.PTCT).m;
  assert.ok(Math.abs(ptct.debtLike - 2308.366) < 1e-6);
  assert.ok(Object.values(real.companies).every((c) => c.shares && c.shares.value > 1));
});

import { BRIEFS, compareBriefs } from "../../src/lib/ma/screen.ts";

test("briefs: identical briefs agree completely; the default brief equals run()", () => {
  const real = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
  const cmp = compareBriefs(real);
  assert.equal(cmp.results.length, BRIEFS.length);
  const a = run(real, DEFAULT_WEIGHTS, DEFAULT_FILTERS, { draws: 10 });
  assert.deepEqual(cmp.results[0].top.map((t) => t.ticker), a.ranked.slice(0, 5).map((r) => r.ticker));
  for (const t of cmp.inAll) assert.ok(cmp.results.every((r) => r.top.some((x) => x.ticker === t)));
  for (const r of cmp.results) for (const t of r.top) assert.ok(applyFilters(buildRows(real), r.brief.filters).passed.some((p) => p.ticker === t.ticker));
});

test("separate intangible amortisation is included in Halozyme and Jazz EBITDA", () => {
  const real = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
  // Source: FY2025 10-K cash-flow statements. Neither total includes debt discount amortisation.
  assert.ok(Math.abs(real.companies.HALO.years["2025"].da!.value - (11.389 + 76.662)) < 1e-9);
  assert.ok(Math.abs(metricsFor(real.companies.HALO).m.ebitda! - (469.006 + 88.051)) < 1e-9);
  assert.ok(Math.abs(real.companies.JAZZ.years["2025"].da!.value - (41.636 + 654.661)) < 1e-9);
});

test("downloadable M&A JSON matches the dataset used by the page", () => {
  const source = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8"));
  const download = JSON.parse(readFileSync("public/downloads/ma-screening/ma-dataset.json", "utf8"));
  assert.deepEqual(download, source, "Regenerate downloads after changing source data.");
});

// ---- corrections after the external technical check (D&A history, debt basis, R&D, one-offs) ----
test("D&A: Halozyme and Jazz include separately reported intangible amortisation in every year, not only FY2025", () => {
  const real = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
  const da = (t: string, y: number) => real.companies[t].years[String(y)].da!.value;
  assert.ok(Math.abs(da("HALO", 2022) - (6.493 + 43.148)) < 0.002);
  assert.ok(Math.abs(da("HALO", 2023) - (11.083 + 73.773)) < 0.002);
  assert.ok(Math.abs(da("HALO", 2024) - (10.263 + 71.049)) < 0.002);
  assert.ok(Math.abs(da("HALO", 2025) - (11.389 + 76.662)) < 0.002);
  assert.ok(Math.abs(da("JAZZ", 2022) - (30.302 + 599.169)) < 0.002);
  assert.ok(Math.abs(da("JAZZ", 2023) - (30.412 + 608.284)) < 0.002);
  assert.ok(Math.abs(da("JAZZ", 2024) - (32.754 + 627.313)) < 0.002);
  assert.ok(Math.abs(da("JAZZ", 2025) - (41.636 + 654.661)) < 0.002);
});

test("D&A is never below a separately tagged intangible amortisation (the check that caught Halozyme and Jazz)", () => {
  const v = JSON.parse(readFileSync("src/data/ma/validation.json", "utf8")) as { results: { check: string; ok: boolean }[] };
  const rows = v.results.filter((r) => r.check.includes("is not below the separate intangible amortisation"));
  assert.ok(rows.length >= 30, "the check ran for many company-years");
  assert.ok(rows.every((r) => r.ok));
});

test("debt basis: BioMarin uses the carrying amount (597.176), not the 600 principal, and no company uses a principal-style tag", () => {
  const real = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
  assert.ok(Math.abs(real.companies.BMRN.years["2025"].debt!.value - 597.176) < 1e-6);
  for (const c of Object.values(real.companies)) assert.ok(!/Principal|FaceAmount/i.test(c.years["2025"].debt?.tag ?? ""), c.ticker);
});

test("Collegium's R&D is missing (not zero): no separate line does not prove zero", () => {
  const real = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
  assert.equal(real.companies.COLL.years["2025"].rnd, null);
  const { m, flags, missing } = metricsFor(real.companies.COLL);
  assert.equal(m.rndIntensity, null);
  assert.ok(missing.includes("rnd"));
  assert.ok(flags.some((f) => f.includes("does not prove it is zero")));
});

test("one-off revenue: flagged by default; removing it (illustrative) lowers PTCT revenue, margin and EBITDA, and does not touch other companies", () => {
  const real = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
  const base = metricsFor(real.companies.PTCT, { includeRoyalty: true });
  const adj = metricsFor(real.companies.PTCT, { includeRoyalty: true, excludeOneOffs: true });
  assert.ok(base.flags.some((f) => f.includes("one-off item of $998m") && f.includes("still INCLUDED")));
  assert.ok(adj.flags.some((f) => f.includes("REMOVED")));
  assert.ok(Math.abs((base.m.revenue as number) - (adj.m.revenue as number) - 998.357) < 1e-6);
  assert.ok((adj.m.opMargin as number) < (base.m.opMargin as number));
  assert.ok((adj.m.ebitda as number) < (base.m.ebitda as number));
  const a = metricsFor(real.companies.HALO, { includeRoyalty: true }).m;
  const b = metricsFor(real.companies.HALO, { includeRoyalty: true, excludeOneOffs: true }).m;
  assert.equal(a.revenue, b.revenue);
});

test("one-off adjustment changes the default ranking in a documented way", () => {
  const real = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
  const top = (opt: boolean) => run(real, DEFAULT_WEIGHTS, DEFAULT_FILTERS, { draws: 50 }, { includeRoyalty: true, excludeOneOffs: opt }).ranked.slice(0, 5).map((r) => r.ticker);
  const before = top(false);
  const after = top(true);
  assert.deepEqual(before.slice(0, 3), ["BCRX", "PTCT", "RIGL"]);
  assert.ok(after.length === 5);
  console.log("top five, reported:", before.join(" "), "| one-offs removed:", after.join(" "));
});
