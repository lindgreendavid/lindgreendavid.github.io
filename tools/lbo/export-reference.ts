// Exports the default LBO case (inputs, results, sensitivity grids) so the Excel builder and the recalculation check use the web model's numbers.
// Run: node tools/lbo/export-reference.ts
import { writeFileSync } from "node:fs";
import ds from "../../src/data/ma/dataset.json" with { type: "json" };
import { buildTargets, defaultTarget } from "../../src/lib/lbo/targets.ts";
import { inputsFor, irrGrid, runLbo } from "../../src/lib/lbo/model.ts";
import type { Dataset } from "../../src/lib/ma/screen.ts";

const data = ds as unknown as Dataset;
const t = defaultTarget(data, buildTargets(data));
const inputs = inputsFor(t);
const r = runLbo(inputs);
const off = [-2, -1, 0, 1, 2];
const rows1 = off.map((d) => inputs.entryMultiple + d);
const cols1 = off.map((d) => inputs.exitMultiple + d);
const rows2 = off.map((d) => Math.max(0, inputs.seniorX + d * 0.75));
const cols2 = [-0.04, -0.02, 0, 0.02, 0.04].map((d) => inputs.marginTarget + d);
const ref = {
  generated: data.generated,
  target: { ticker: t.ticker, name: t.name, revenue: t.revenue, ebitda: t.ebitda, da: t.da, netDebt: t.netDebt },
  inputs,
  result: { ev0: r.ev0, fees: r.fees, uses: r.uses, sponsorEquity: r.sponsorEquity, exitEv: r.exitEv, exitNetDebt: r.exitNetDebt, exitEquity: r.exitEquity, moic: r.moic, irr: r.irr, bridge: r.bridge, years: r.years.map((y) => ({ revenue: y.revenue, ebitda: y.ebitda, interest: y.interest, tax: y.tax, fcf: y.fcf, senior: y.senior, sub: y.sub, cash: y.cash })) },
  sens: {
    entryExit: { rows: rows1, cols: cols1, values: irrGrid(inputs, "entryMultiple", rows1, "exitMultiple", cols1) },
    debtMargin: { rows: rows2, cols: cols2, values: irrGrid(inputs, "seniorX", rows2, "marginTarget", cols2) },
  },
};
writeFileSync(new URL("../../src/data/lbo/reference.json", import.meta.url), JSON.stringify(ref, null, 2));
console.log(`${t.name}: IRR ${(r.irr * 100).toFixed(2)}%, MOIC ${r.moic.toFixed(3)}x, sponsor equity ${r.sponsorEquity.toFixed(1)}`);
