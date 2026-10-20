// Exports the web model's base-case inputs and results so the Excel workbook can be checked against the same numbers.
import fs from "node:fs";
import path from "node:path";
import { dcfInputsFor, runDcf, SCENARIOS } from "../../src/lib/pharma/model.ts";
import type { Dataset } from "../../src/lib/pharma/model.ts";

const root = path.resolve(import.meta.dirname, "../..");
const ds = JSON.parse(fs.readFileSync(path.join(root, "src/data/pharma/dataset.json"), "utf8")) as Dataset;
const base = SCENARIOS.base;
const inputs = dcfInputsFor(ds, base);
const r = runDcf(inputs);
const out = {
  note: "Generated from src/lib/pharma/model.ts. The workbook's Checks sheet compares its own formulas with these values.",
  scenario: base.name,
  inputs: { taxRate: base.taxRate, daPct: base.daPct, capexPct: base.capexPct, nwcPct: base.nwcPct, targetMargin: base.targetMargin, wacc: base.wacc, terminalGrowth: base.terminalGrowth, growth: base.growth },
  enterpriseValue: r.enterpriseValue,
  equityValue: r.equityValue,
  valuePerShare: r.valuePerShare,
  terminalShareOfEv: r.terminalShareOfEv,
  fcff: r.years.map((y) => y.fcff),
};
fs.writeFileSync(path.join(root, "src/data/pharma/model-reference.json"), JSON.stringify(out, null, 1));
console.log("model-reference.json written:", out.valuePerShare.toFixed(4), out.enterpriseValue.toFixed(2));
