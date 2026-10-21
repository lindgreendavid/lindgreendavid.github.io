// Developer helper: node tools/pharma/check-wacc.ts [wacc] — value per share from the web model, to compare with the Excel workbook.
import { readFileSync } from "node:fs";
import { dcfInputsFor, runDcf, SCENARIOS } from "../../src/lib/pharma/model.ts";
const ds = JSON.parse(readFileSync("src/data/pharma/dataset.json", "utf8"));
const i = dcfInputsFor(ds, SCENARIOS.base);
const w = Number(process.argv[2] ?? i.wacc);
const r = runDcf({ ...i, wacc: w });
console.log(`WACC ${w}: value per share ${r.valuePerShare.toFixed(4)}`);
