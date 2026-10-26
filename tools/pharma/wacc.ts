// Worked WACC for AstraZeneca from sourced inputs, and the DCF value it implies. Developer helper: node tools/pharma/wacc.ts
// Inputs are public, were read on 2026-10-26 and were checked against their sources by an external reviewer (see WACC_WORKSHEET.md).
// The credit spread uses AstraZeneca's FY2025 ratings (Moody's A1, S&P A+; stated in the 20-F) with Damodaran's January 2026 spread of 0.70% (a rating-based proxy, not a measured bond spread).
import { readFileSync } from "node:fs";
import { dcfInputsFor, runDcf, SCENARIOS } from "../../src/lib/pharma/model.ts";

const ds = JSON.parse(readFileSync("src/data/pharma/dataset.json", "utf8"));
const base = dcfInputsFor(ds, SCENARIOS.base);

type In = { rf: number; erp: number; unlevBeta: number; de: number; tax: number; spread: number };
const wacc = (i: In) => {
  const levBeta = i.unlevBeta * (1 + (1 - i.tax) * i.de);
  const ke = i.rf + levBeta * i.erp;
  const kdPre = i.rf + i.spread;
  const kd = kdPre * (1 - i.tax);
  const wd = i.de / (1 + i.de);
  const we = 1 - wd;
  return { levBeta, ke, kdPre, kd, wd, we, wacc: we * ke + wd * kd };
};
const central: In = { rf: 0.0496, erp: 0.0423, unlevBeta: 0.96, de: 0.1494, tax: 0.25, spread: 0.007 };
const show = (name: string, i: In) => {
  const w = wacc(i);
  const v = runDcf({ ...base, wacc: w.wacc }).valuePerShare;
  console.log(`${name.padEnd(34)} WACC ${(w.wacc * 100).toFixed(2)}%  (Ke ${(w.ke * 100).toFixed(2)}%, levered beta ${w.levBeta.toFixed(3)}, Kd after tax ${(w.kd * 100).toFixed(2)}%, D/V ${(w.wd * 100).toFixed(1)}%)  value/share $${v.toFixed(2)}`);
};
show("Central (global pharma beta 0.96)", central);
show("US pharma beta 0.89", { ...central, unlevBeta: 0.89 });
show("ERP 5.0%", { ...central, erp: 0.05 });
show("ERP 4.0%", { ...central, erp: 0.04 });
show("Credit spread 1.1% (old placeholder)", { ...central, spread: 0.011 });
show("Credit spread 1.8%", { ...central, spread: 0.018 });
show("Cash-corrected beta 1.00", { ...central, unlevBeta: 1.0 });
show("Tax 17.5% in beta and debt shield", { ...central, tax: 0.175 });
console.log(`Typed-in base case: WACC 7.50%  value/share $${runDcf(base).valuePerShare.toFixed(2)}`);
const w = wacc(central);
console.log(`Unrounded central WACC: ${(w.wacc * 100).toFixed(6)}%; entering exactly 8.80% gives $${runDcf({ ...base, wacc: 0.088 }).valuePerShare.toFixed(2)}`);
console.log(`Implied historical cost of debt check: interest on borrowings 2025 1,335 / average borrowings (30,295+29,622)/2 = ${((1335 / ((30295 + 29622) / 2)) * 100).toFixed(2)}%`);
