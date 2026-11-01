import { test } from "node:test";
import assert from "node:assert/strict";
import { altmanZpp, bucketOf, buildRows, factorScores, headroom, interp, ratiosFrom, stress, totalScore, FACTORS, FACTOR_INFO } from "../../src/lib/credit/model.ts";
import type { Extra, Raw } from "../../src/lib/credit/model.ts";
import type { Company } from "../../src/lib/ma/screen.ts";

const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const raw = (o: Partial<Raw> = {}): Raw => ({ revenue: 500, ebitda: 100, cfo: 80, capex: 10, debt: 300, cash: 100, interest: 20, interestIsCashPaid: false, ...o });

test("weights add up to 100", () => {
  close(FACTORS.reduce((a, f) => a + FACTOR_INFO[f].weight, 0), 100);
});

test("interp is flat outside the anchors and linear inside", () => {
  const pts: [number, number][] = [[2, 85], [4, 55]];
  close(interp(1, pts), 85);
  close(interp(3, pts), 70);
  close(interp(9, pts), 55);
});

test("ratios: leverage, coverage, free cash flow, liquidity from known numbers", () => {
  const r = ratiosFrom(raw());
  close(r.netDebt as number, 200);
  close(r.leverage as number, 2);
  close(r.coverage as number, 5);
  close(r.fcf as number, 70);
  close(r.fcfToDebt as number, 70 / 300);
  close(r.liquidity as number, 100 / 300);
  close(r.margin as number, 0.2);
});

test("net cash, no debt and negative EBITDA are handled, not divided by", () => {
  assert.equal(ratiosFrom(raw({ debt: 50, cash: 200 })).leverage, "net cash");
  assert.equal(ratiosFrom(raw({ debt: 0 })).coverage, "no debt");
  assert.equal(ratiosFrom(raw({ debt: 0 })).fcfToDebt, "no debt");
  assert.equal(ratiosFrom(raw({ ebitda: -10 })).leverage, "n/m");
  assert.equal(ratiosFrom(raw({ ebitda: -10 })).coverage, "n/m");
});

test("scores: anchors give the stated values", () => {
  const s = factorScores(ratiosFrom(raw()));
  close(s.leverage as number, 85); // 2x
  close(s.coverage as number, 55 + ((85 - 55) * (5 - 4)) / (8 - 4)); // 5x: a quarter of the way from 4x (55) to 8x (85)
  close(s.margin as number, 40 + ((75 - 40) * (0.2 - 0.1)) / (0.25 - 0.1)); // 20%
});

test("net cash and no debt score the maximum on the debt factors", () => {
  const s = factorScores(ratiosFrom(raw({ debt: 0, cash: 200 })));
  assert.equal(s.leverage, 100);
  assert.equal(s.coverage, 100);
  assert.equal(s.fcf, 100);
  assert.equal(s.liquidity, 100);
});

test("missing factors are dropped and the weights rescaled", () => {
  const full = totalScore({ leverage: 80, coverage: 80, fcf: 80, liquidity: 80, margin: 80 })!;
  close(full.score, 80);
  close(full.used, 100);
  const part = totalScore({ leverage: 100, coverage: null, fcf: null, liquidity: null, margin: 0 })!;
  close(part.used, 40);
  close(part.score, (100 * 30 + 0 * 10) / 40);
  assert.equal(totalScore({ leverage: null, coverage: null, fcf: null, liquidity: null, margin: null }), null);
});

test("buckets sit on the stated boundaries", () => {
  assert.equal(bucketOf(75), "Low strain");
  assert.equal(bucketOf(74.99), "Moderate strain");
  assert.equal(bucketOf(55), "Moderate strain");
  assert.equal(bucketOf(35), "Elevated strain");
  assert.equal(bucketOf(34.9), "High strain");
});

test("headroom closed form: leverage binds, then coverage binds", () => {
  // net debt 200, EBITDA 100, limit 4x: EBITDA can fall to 50 (50%). Coverage floor 3x on interest 20 needs EBITDA 60 (40%)... so coverage binds first.
  const h = headroom(raw(), 4, 3)!;
  assert.equal(h.binding, "coverage");
  close(h.value, 0.4);
  // floor 2x needs EBITDA 40 (60%), leverage needs 50 (50%): leverage binds
  const h2 = headroom(raw(), 4, 2)!;
  assert.equal(h2.binding, "leverage");
  close(h2.value, 0.5);
});

test("headroom: net cash has no leverage limit; no debt has no constraint; breach is zero", () => {
  assert.equal(headroom(raw({ debt: 0, cash: 100, interest: null }), 4, 3)!.binding, "none");
  close(headroom(raw({ debt: 50, cash: 100 }), 4, 3)!.value, 1 - (3 * 20) / 100);
  assert.equal(headroom(raw({ debt: 500, cash: 0, ebitda: 100 }), 4, 3)!.binding, "already");
  assert.equal(headroom(raw({ ebitda: -5 }), 4, 3)!.binding, "already");
  // net cash but negative EBITDA with interest to pay: cover is already below any floor
  assert.equal(headroom(raw({ debt: 50, cash: 200, ebitda: -5, interest: 10 }), 4, 3)!.binding, "already");
  assert.equal(headroom(raw({ interest: null }), 4, 3), null);
});

test("headroom is exactly where the limit is hit", () => {
  const r = raw();
  const h = headroom(r, 4, 2)!.value; // leverage binds
  const e = r.ebitda! * (1 - h);
  close((r.debt! - r.cash!) / e, 4);
  const h3 = headroom(r, 10, 3)!.value; // coverage binds
  close((r.ebitda! * (1 - h3)) / r.interest!, 3);
});

test("stress lowers EBITDA and cash flow, adds cash burn to net debt and never improves a score", () => {
  const r = raw();
  const s = stress(r, 0.5);
  close(s.ebitda as number, 50);
  close(s.cfo as number, 30);
  const base = totalScore(factorScores(ratiosFrom(r)))!.score;
  const hit = totalScore(factorScores(ratiosFrom(s)))!.score;
  assert.ok(hit < base);
  const burn = stress(raw({ cfo: 10, capex: 10 }), 0.5); // FCF 0 becomes -50
  close(burn.cash as number, 100 - 50);
  close(stress(r, 0).ebitda as number, 100);
});

test("Altman Z'': worked example and zones", () => {
  const a = altmanZpp({ workingCapital: 200, retainedEarnings: 300, ebit: 150, equity: 500, assets: 1000, liabilities: 500 })!;
  close(a.z, 6.56 * 0.2 + 3.26 * 0.3 + 6.72 * 0.15 + 1.05 * 1);
  assert.equal(a.zone, "safe");
  assert.equal(altmanZpp({ workingCapital: -100, retainedEarnings: -500, ebit: -50, equity: 100, assets: 1000, liabilities: 900 })!.zone, "distress");
  assert.equal(altmanZpp({ workingCapital: 0, retainedEarnings: 0, ebit: 0, equity: 0, assets: 0, liabilities: 0 }), null);
});

test("buildRows runs on a small made-up company and flags what is missing", () => {
  const cell = (value: number) => ({ value, tag: "t", accn: "a", filed: "2026-02-01", end: "2025-12-31" });
  const c = { ticker: "TEST", name: "Test Inc", sic: "", sicDescription: "", fiscalYearEnd: "1231", years: { "2025": { revenue: cell(500), operating_income: cell(80), da: cell(20), cfo: cell(80), cash: cell(100), debt: cell(300), st_investments: null, assets: cell(900), rnd: null, net_income: null } } } as unknown as Company;
  const extra: Extra = { generated: "x", companies: { TEST: { ticker: "TEST", years: { "2025": { interest_expense: cell(20), interest_paid: null, capex: null, assets_current: cell(300), liabilities_current: cell(100), liabilities: null, equity: cell(400), retained_earnings: cell(200) } } } } };
  const [r] = buildRows([c], extra);
  close(r.ratios.leverage as number, 2);
  assert.ok(r.flags.some((f) => f.includes("Capex not tagged")));
  assert.ok(r.flags.some((f) => f.includes("Total liabilities not tagged")));
  assert.ok(r.altman !== null);
  assert.ok(r.score !== null && r.bucket !== null);
  assert.ok((r.stressedScore as number) <= (r.score as number));
});
