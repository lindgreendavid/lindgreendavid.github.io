import { test } from "node:test";
import assert from "node:assert/strict";
import { HOLD_YEARS, LboInputError, inputsFor, irrGrid, runLbo, validateLbo } from "../../src/lib/lbo/model.ts";
import type { LboInputs } from "../../src/lib/lbo/model.ts";

const base = (): LboInputs => inputsFor({ revenue: 500, ebitda: 100, da: 25, netDebt: 200 });
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("sources equal uses and the equity cheque is the plug", () => {
  const r = runLbo(base());
  close(r.uses, r.ev0 + r.fees);
  close(r.senior0 + r.sub0 + r.sponsorEquity, r.uses);
  close(r.ev0, 1000);
  close(r.senior0, 350);
  close(r.sub0, 150);
});

test("the value bridge adds up to the equity gain, in several cases", () => {
  const cases: Partial<LboInputs>[] = [{}, { exitMultiple: 12 }, { exitMultiple: 7, seniorX: 5 }, { marginTarget: 0.28, growth: [0.1, 0.08, 0.06, 0.04, 0.02] }, { sweepPct: 0 }, { seniorX: 5, subX: 1, marginTarget: 0.03, exitMultiple: 5 }];
  for (const c of cases) {
    const r = runLbo({ ...base(), ...c });
    const b = r.bridge;
    close(b.ebitdaGrowth + b.multiple + b.deleveraging + b.fees + b.limitedLiability, b.total, 1e-6);
    close(b.total, r.sponsorProceeds - r.sponsorEquity, 1e-6);
  }
});

test("closed-form case: no debt, no growth, no tax or capex, all cash retained", () => {
  const i = { ...base(), seniorX: 0, subX: 0, growth: [0, 0, 0, 0, 0], taxRate: 0, capexPct: 0, nwcPct: 0, feePct: 0.02, netDebt0: 0 };
  const r = runLbo(i);
  close(r.sponsorEquity, 1020);
  close(r.years[HOLD_YEARS - 1].cash, 500);
  close(r.exitEquity, 1500);
  close(r.moic, 1500 / 1020);
  close(r.irr, Math.pow(1500 / 1020, 1 / 5) - 1);
});

test("IRR is the MOIC annualised over five years", () => {
  const r = runLbo(base());
  close(r.irr, Math.pow(r.moic, 1 / HOLD_YEARS) - 1);
});

test("interest is charged on opening balances: year 1 uses the closing debt", () => {
  const r = runLbo(base());
  close(r.years[0].interest, 350 * 0.08 + 150 * 0.11);
});

test("debt never goes negative and the sweep stops when the senior debt is gone", () => {
  const r = runLbo({ ...base(), seniorX: 1, subX: 0, growth: [0.1, 0.1, 0.1, 0.1, 0.1] });
  for (const y of r.years) {
    assert.ok(y.senior >= -1e-9);
    assert.ok(y.sub >= 0);
  }
  assert.ok(r.years[HOLD_YEARS - 1].senior < 1e-9);
  assert.ok(r.years[HOLD_YEARS - 1].cash > 0);
});

test("with no sweep the senior debt falls only by the mandatory repayment and cash builds", () => {
  const r = runLbo({ ...base(), sweepPct: 0 });
  close(r.years[0].senior, 350 - 0.01 * 350);
  assert.ok(r.years[0].cash > 0);
});

test("more debt raises the return when the business earns more than the debt costs (and lowers the equity cheque)", () => {
  const low = runLbo({ ...base(), seniorX: 2, subX: 0 });
  const high = runLbo({ ...base(), seniorX: 4, subX: 0 });
  assert.ok(high.sponsorEquity < low.sponsorEquity);
  assert.ok(high.irr > low.irr);
});

test("a higher exit multiple raises the return and a higher entry multiple lowers it", () => {
  const b = runLbo(base()).irr;
  assert.ok(runLbo({ ...base(), exitMultiple: 12 }).irr > b);
  assert.ok(runLbo({ ...base(), entryMultiple: 12, exitMultiple: 10 }).irr < b);
});

test("a margin collapse can wipe out the equity and the IRR is reported as -100%", () => {
  const r = runLbo({ ...base(), seniorX: 5, subX: 1, marginTarget: 0.03, exitMultiple: 5 });
  assert.ok(r.exitEquity <= 0);
  close(r.irr, -1);
  close(r.sponsorProceeds, 0); // limited liability: the sponsor cannot receive a negative amount
  close(r.moic, 0);
  assert.ok(r.bridge.limitedLiability > 0);
  assert.ok(r.flags.some((f) => f.includes("wiped out")));
});

test("flags: very high leverage and thin coverage are reported", () => {
  const r = runLbo({ ...base(), seniorX: 5.5, subX: 2, entryMultiple: 12, exitMultiple: 12 });
  assert.ok(r.flags.some((f) => f.includes("very high")));
});

test("validation rejects nonsense with a reason", () => {
  assert.throws(() => validateLbo({ ...base(), ebitda0: 0 }), LboInputError);
  assert.throws(() => validateLbo({ ...base(), seniorX: 9, subX: 2 }), /no equity cheque/);
  assert.throws(() => validateLbo({ ...base(), growth: [0.1] }), /five growth/);
  assert.throws(() => validateLbo({ ...base(), entryMultiple: Number.NaN }), /number/);
  assert.throws(() => validateLbo({ ...base(), taxRate: 1.2 }), /Tax rate/);
  assert.throws(() => validateLbo({ ...base(), seniorRate: 0.9 }), /Interest rates/);
});

test("the sensitivity grid agrees with a direct run and marks invalid cells", () => {
  const b = base();
  const g = irrGrid(b, "entryMultiple", [8, 10, 12], "exitMultiple", [8, 10, 12]);
  close(g[1][1] as number, runLbo(b).irr);
  close(g[0][2] as number, runLbo({ ...b, entryMultiple: 8, exitMultiple: 12 }).irr);
  const g2 = irrGrid(b, "seniorX", [1, 12], "exitMultiple", [10]);
  assert.ok(g2[0][0] !== null);
  assert.equal(g2[1][0], null);
});

import { monteCarlo, tornado } from "../../src/lib/lbo/model.ts";

test("Monte Carlo is reproducible for a seed and collapses to the base case at zero spread", () => {
  const a = monteCarlo(base(), { draws: 500, seed: 3 });
  const b = monteCarlo(base(), { draws: 500, seed: 3 });
  assert.equal(a.p50, b.p50);
  const z = monteCarlo(base(), { draws: 50, seed: 3, scale: 0 });
  close(z.p5, runLbo(base()).irr, 1e-9);
  close(z.p95, runLbo(base()).irr, 1e-9);
});

test("Monte Carlo quantiles are ordered, the median is near the base case, and the histogram counts every draw", () => {
  const m = monteCarlo(base(), { draws: 2000, seed: 1 });
  assert.ok(m.p5 <= m.p25 && m.p25 <= m.p50 && m.p50 <= m.p75 && m.p75 <= m.p95);
  assert.ok(Math.abs(m.p50 - runLbo(base()).irr) < 0.03);
  assert.equal(m.hist.reduce((s, h) => s + h.count, 0), 2000);
  assert.ok(m.probLoss >= 0 && m.probLoss <= 1);
  assert.ok(m.p95 - m.p5 > 0.02);
});

test("a wider spread widens the distribution of returns", () => {
  const narrow = monteCarlo(base(), { draws: 2000, seed: 5, scale: 0.5 });
  const wide = monteCarlo(base(), { draws: 2000, seed: 5, scale: 1.5 });
  assert.ok(wide.p95 - wide.p5 > narrow.p95 - narrow.p5);
});

test("tornado: sorted by swing, base unchanged, exit multiple moves the return in the expected direction", () => {
  const t = tornado(base());
  close(t.base, runLbo(base()).irr);
  for (let i = 1; i < t.rows.length; i++) assert.ok(t.rows[i - 1].swing >= t.rows[i].swing);
  const exit = t.rows.find((r) => r.driver === "Exit multiple")!;
  close(exit.low as number, runLbo({ ...base(), exitMultiple: base().exitMultiple - 2 }).irr);
  close(exit.high as number, runLbo({ ...base(), exitMultiple: base().exitMultiple + 2 }).irr);
  assert.ok((exit.low as number) < t.base && (exit.high as number) > t.base);
});

test("a funding gap is flagged, marked on the result and the flag says the return is conditional", () => {
  const gap = runLbo({ ...base(), seniorX: 5, subX: 1, capexPct: 0.1, marginTarget: 0.35, growth: [-0.5, 0.5, 0.5, 0.3, 0.2] });
  assert.equal(gap.fundingGap, true);
  assert.ok(gap.years.some((y) => y.cash < 0));
  assert.ok(gap.flags.some((f) => f.includes("conditional")));
  assert.equal(runLbo(base()).fundingGap, false);
});

test("Monte Carlo at zero spread reproduces the base case for valid inputs outside the usual clamps", () => {
  for (const o of [{ marginTarget: 0.01 }, { marginTarget: 0.97 }, { exitMultiple: 0.5 }, { growth: [-0.7, 0, 0, 0, 0] }]) {
    const i = { ...base(), seniorX: 0, subX: 0, ...o };
    const z = monteCarlo(i, { draws: 10, scale: 0 });
    close(z.p50, runLbo(i).irr, 1e-9);
  }
});

test("Monte Carlo reports funding-gap cases separately and leaves them out of the return figures", () => {
  const i = { ...base(), seniorX: 5, subX: 1, capexPct: 0.1, marginTarget: 0.2, growth: [-0.1, 0.1, 0.1, 0.1, 0.1] };
  const m = monteCarlo(i, { draws: 1500, seed: 2 });
  assert.ok(m.probGap > 0 && m.probGap < 1, `gap share ${m.probGap}`);
  assert.equal(m.fundedDraws, Math.round(m.draws * (1 - m.probGap)));
  assert.equal(m.hist.reduce((s, h) => s + h.count, 0), m.fundedDraws);
  assert.equal(monteCarlo(base(), { draws: 300, seed: 1 }).probGap, 0);
});
