import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { comparable, dcfInputsFor, line, multiples, runDcf, SCENARIOS, sensitivity, sensitivityOperating, toUsdRate, YEARS } from "../../src/lib/pharma/model.ts";
import type { Dataset, DcfInputs } from "../../src/lib/pharma/model.ts";

const root = path.resolve(import.meta.dirname, "../..");
const ds = JSON.parse(fs.readFileSync(path.join(root, "src/data/pharma/dataset.json"), "utf8")) as Dataset;
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} !~ ${b}`);

const flat = (overrides: Partial<DcfInputs> = {}): DcfInputs => ({
  baseRevenue: 1000,
  baseOperatingMargin: 0.2,
  growth: [0, 0, 0, 0, 0],
  targetMargin: 0.2,
  taxRate: 0.2,
  daPct: 0.05,
  capexPct: 0.06,
  nwcPct: 0.01,
  wacc: 0.08,
  terminalGrowth: 0.02,
  bridge: { debtInclLeases: 100, cash: 50, equityMethodInvestments: 10, pensionDeficit: 20, nonControllingInterests: 5 },
  sharesMillions: 10,
  ...overrides,
});

test("DCF equals the closed-form value when cash flow is constant", () => {
  const i = flat();
  const fcff = 1000 * 0.2 * (1 - 0.2) + 1000 * 0.05 - 1000 * 0.06 - 1000 * 0.01; // 160 + 50 - 60 - 10 = 140
  const w = i.wacc;
  const annuity = (1 - Math.pow(1 + w, -5)) / w;
  const tv = (fcff * (1 + i.terminalGrowth)) / (w - i.terminalGrowth);
  const expected = fcff * annuity + tv / Math.pow(1 + w, 5);
  const r = runDcf(i);
  close(r.years[0].fcff, fcff);
  close(r.enterpriseValue, expected);
});

test("enterprise-to-equity bridge adds up and per-share value multiplies back to equity", () => {
  const i = flat();
  const r = runDcf(i);
  close(r.equityValue, r.enterpriseValue - 100 + 50 + 10 - 20 - 5);
  close(r.valuePerShare * i.sharesMillions, r.equityValue);
  close(
    r.bridge.reduce((s, x, n) => (n === 0 ? x.amount : n === r.bridge.length - 1 ? s : s + x.amount), 0),
    r.equityValue
  );
});

test("value falls when WACC rises and rises with terminal growth, margin and growth", () => {
  const base = runDcf(flat()).enterpriseValue;
  assert.ok(runDcf(flat({ wacc: 0.09 })).enterpriseValue < base);
  assert.ok(runDcf(flat({ wacc: 0.07 })).enterpriseValue > base);
  assert.ok(runDcf(flat({ terminalGrowth: 0.03 })).enterpriseValue > base);
  assert.ok(runDcf(flat({ targetMargin: 0.25 })).enterpriseValue > base);
  assert.ok(runDcf(flat({ growth: [0.05, 0.05, 0.05, 0.05, 0.05] })).enterpriseValue > base);
  assert.ok(runDcf(flat({ taxRate: 0.3 })).enterpriseValue < base);
});

test("a higher claim on value lowers equity value one-for-one", () => {
  const a = runDcf(flat());
  const b = runDcf(flat({ bridge: { ...flat().bridge, debtInclLeases: 200 } }));
  close(a.equityValue - b.equityValue, 100);
  close(a.enterpriseValue, b.enterpriseValue);
});

test("discount factors fall over time and the terminal share of value is sensible", () => {
  const r = runDcf(runDcfInputs());
  for (let t = 1; t < r.years.length; t++) assert.ok(r.years[t].discountFactor < r.years[t - 1].discountFactor);
  assert.ok(r.terminalShareOfEv > 0 && r.terminalShareOfEv < 1);
});

test("WACC at or below terminal growth is rejected", () => {
  assert.throws(() => runDcf(flat({ wacc: 0.02, terminalGrowth: 0.02 })), /higher than terminal growth/);
});

function runDcfInputs() {
  return dcfInputsFor(ds);
}

test("AstraZeneca scenarios are ordered low < base < high and use FY2025 balance-sheet claims", () => {
  const v = (s: keyof typeof SCENARIOS) => runDcf(dcfInputsFor(ds, SCENARIOS[s])).valuePerShare;
  assert.ok(v("low") < v("base") && v("base") < v("high"), `${v("low")} ${v("base")} ${v("high")}`);
  const i = dcfInputsFor(ds);
  close(i.bridge.debtInclLeases, 29622);
  close(i.bridge.cash, 5711);
  close(i.bridge.pensionDeficit, 1105);
  close(i.bridge.equityMethodInvestments, 302);
  close(i.sharesMillions, 1550.907927);
});

test("sensitivity grids are consistent with the point estimate", () => {
  const i = dcfInputsFor(ds);
  const grid = sensitivity(i, [0.07, 0.075, 0.08], [0.015, 0.02, 0.025]);
  close(grid.values[1][1], runDcf(i).valuePerShare);
  assert.ok(grid.values[0][1] > grid.values[1][1] && grid.values[1][1] > grid.values[2][1]); // lower WACC, higher value
  assert.ok(grid.values[1][0] < grid.values[1][1] && grid.values[1][1] < grid.values[1][2]); // higher growth, higher value
  const impossible = sensitivity(i, [0.02], [0.02, 0.03]);
  assert.ok(Number.isNaN(impossible.values[0][0]) && Number.isNaN(impossible.values[0][1]));
  const op = sensitivityOperating(i, [-0.01, 0, 0.01], [0.23, 0.25, 0.27]);
  close(op.values[1][1], runDcf(i).valuePerShare);
  assert.ok(op.values[2][1] > op.values[0][1] && op.values[1][2] > op.values[1][0]);
});

test("dataset covers three companies and three years with the core lines", () => {
  const core = ["revenue", "operating_profit", "profit_continuing", "cfo", "capex_ppe", "cash"];
  for (const c of Object.keys(ds.companies)) for (const y of YEARS) for (const m of core) assert.ok(line(ds, c, y, m, "local") !== undefined, `${c} ${y} ${m}`);
  assert.equal(Object.keys(ds.companies).length, 3);
});

test("comparable metrics follow their definitions", () => {
  const az = comparable(ds, "astrazeneca", 2025, "usd");
  close(az.revenue, 58739);
  close(az.operatingMargin, 13743 / 58739);
  close(az.fcfPpe, 14575 - 2810);
  close(az.fcfAfterIntangibles, 14575 - 2810 - 3095);
  close(az.debtInclLeases, 29622);
  close(az.netDebt, 29622 - 5711);
  close(az.revenueGrowth!, 58739 / 54073 - 1);
  const nv = comparable(ds, "novartis", 2025, "usd");
  close(nv.revenue, 54532 + 2142);
  close(nv.debtInclLeases, 33537 + 1920);
});

test("Novartis: reported net debt excludes leases, so our net debt differs from it by exactly the lease liabilities", () => {
  const nv = comparable(ds, "novartis", 2025, "usd");
  const reportedNetDebt = 21947; // company-reported, confirmed against the balance sheet in the reconciliation
  close(nv.netDebt - reportedNetDebt, line(ds, "novartis", 2025, "lease_liabilities", "usd")!);
});

test("Novartis 2023 uses continuing operations (the Sandoz gain is excluded)", () => {
  close(line(ds, "novartis", 2023, "profit_continuing", "usd")!, 8572);
  close(line(ds, "novartis", 2023, "cfo", "usd")!, 14220);
});

test("currency translation uses average for flows and year-end for balances", () => {
  const gbpFlow = toUsdRate(ds, "gsk", 2025, "flow");
  const gbpBal = toUsdRate(ds, "gsk", 2025, "balance");
  assert.ok(gbpFlow > 1.2 && gbpFlow < 1.45 && gbpBal > 1.2 && gbpBal < 1.45);
  assert.notEqual(gbpFlow, gbpBal);
  close(line(ds, "gsk", 2025, "revenue", "usd")!, 32667 * gbpFlow);
  close(line(ds, "gsk", 2025, "cash", "usd")!, 3397 * gbpBal);
  assert.equal(toUsdRate(ds, "novartis", 2024, "flow"), 1);
});

test("multiples: EV is market cap plus net debt plus book NCI, and ratios use the same EV", () => {
  const m = multiples(ds, "gsk", 80000);
  const c = comparable(ds, "gsk", 2025, "usd");
  const nci = line(ds, "gsk", 2025, "nci_book", "usd")!;
  close(m.enterpriseValue, 80000 + c.netDebt + nci);
  close(m.evToRevenue, m.enterpriseValue / c.revenue);
  close(m.evToOperatingProfit, m.enterpriseValue / c.operatingProfit);
  assert.ok(m.ncIncluded);
  // Doubling the market cap raises EV by exactly the increase in market cap.
  close(multiples(ds, "gsk", 160000).enterpriseValue - m.enterpriseValue, 80000);
});

test("P/E uses profit attributable to owners (profit less the non-controlling share)", () => {
  const m = multiples(ds, "gsk", 80000);
  const profit = line(ds, "gsk", 2025, "profit_continuing", "usd")!;
  const nciProfit = line(ds, "gsk", 2025, "nci_profit", "usd")!;
  close(m.priceToEarnings, 80000 / (profit - nciProfit));
});

// ---- input validation ----
import { DcfInputError, validateDcfInputs } from "../../src/lib/pharma/model.ts";

test("validateDcfInputs: rejects non-finite values, empty forecasts and invalid share counts with plain messages", () => {
  const ds = JSON.parse(fs.readFileSync("src/data/pharma/dataset.json", "utf8"));
  const base = dcfInputsFor(ds, SCENARIOS.base);
  assert.equal(validateDcfInputs(base), null);
  assert.match(validateDcfInputs({ ...base, growth: [] })!, /at least one year/);
  assert.match(validateDcfInputs({ ...base, growth: [0.05, NaN, 0.03, 0.02, 0.02] })!, /Every year of revenue growth/);
  assert.match(validateDcfInputs({ ...base, growth: [0.05, -1, 0.03] })!, /-100%/);
  assert.match(validateDcfInputs({ ...base, wacc: NaN })!, /positive number/);
  assert.match(validateDcfInputs({ ...base, wacc: Infinity })!, /below 100%|positive number/);
  assert.match(validateDcfInputs({ ...base, wacc: 0.01, terminalGrowth: 0.02 })!, /higher than terminal growth/);
  assert.match(validateDcfInputs({ ...base, sharesMillions: 0 })!, /share count/);
  assert.match(validateDcfInputs({ ...base, sharesMillions: -5 })!, /share count/);
  assert.match(validateDcfInputs({ ...base, sharesMillions: NaN })!, /share count/);
  assert.match(validateDcfInputs({ ...base, taxRate: 1.2 })!, /tax rate/);
  assert.match(validateDcfInputs({ ...base, baseRevenue: 0 })!, /Base revenue/);
  assert.match(validateDcfInputs({ ...base, bridge: { ...base.bridge, cash: NaN } })!, /bridge item/);
  assert.throws(() => runDcf({ ...base, growth: [] }), DcfInputError);
  assert.throws(() => runDcf({ ...base, sharesMillions: 0 }), DcfInputError);
});

test("validateDcfInputs keeps legitimate cases valid: negative growth, a working-capital release, a lower target margin", () => {
  const ds = JSON.parse(fs.readFileSync("src/data/pharma/dataset.json", "utf8"));
  const base = dcfInputsFor(ds, SCENARIOS.base);
  const decline = { ...base, growth: [-0.03, -0.02, 0, 0.01, 0.01], targetMargin: 0.18 };
  assert.equal(validateDcfInputs(decline), null);
  assert.ok(Number.isFinite(runDcf(decline).valuePerShare));
  const release = { ...base, nwcPct: -0.005 };
  assert.equal(validateDcfInputs(release), null);
  assert.ok(runDcf(release).valuePerShare > runDcf(base).valuePerShare, "a working-capital release raises value");
  assert.equal(runDcf({ ...base, growth: [0.05] }).years.length, 1);
});
