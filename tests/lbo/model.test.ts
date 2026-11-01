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
  const cases: Partial<LboInputs>[] = [{}, { exitMultiple: 12 }, { exitMultiple: 7, seniorX: 5 }, { marginTarget: 0.28, growth: [0.1, 0.08, 0.06, 0.04, 0.02] }, { sweepPct: 0 }];
  for (const c of cases) {
    const r = runLbo({ ...base(), ...c });
    const b = r.bridge;
    close(b.ebitdaGrowth + b.multiple + b.deleveraging + b.fees, b.total, 1e-6);
    close(b.total, r.exitEquity - r.sponsorEquity, 1e-6);
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
