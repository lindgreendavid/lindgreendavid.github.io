// Diagnostic for the persistence check: how complete are the FY2022 scores, and how much did the companies move? Run: node tools/credit/preview-persist.ts
import { readFileSync } from "node:fs";
import { DEFAULT_OPTIONS, compact, rowFor } from "../../src/lib/credit/model.ts";
import type { Extra } from "../../src/lib/credit/model.ts";
import type { Company, Dataset } from "../../src/lib/ma/screen.ts";

const ds = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
const extra = JSON.parse(readFileSync("src/data/credit/extra.json", "utf8")) as Extra;
const o = { ...DEFAULT_OPTIONS, includeRoyalty: false };
const ks = (Object.values(ds.companies) as Company[]).map((c) => compact(c, extra.companies[c.ticker]));
let partial = 0;
for (const k of ks) {
  const a = rowFor(k, 2022, o);
  const b = rowFor(k, 2025, o);
  if (a.used < 100) partial++;
  console.log(k.ticker.padEnd(5), "2022", (a.score ?? NaN).toFixed(0).padStart(3), "used", String(a.used).padStart(3), "lev", String(typeof a.ratios.leverage === "number" ? a.ratios.leverage.toFixed(1) : a.ratios.leverage).padStart(8), "| 2025", (b.score ?? NaN).toFixed(0).padStart(3), "used", String(b.used).padStart(3), "lev", String(typeof b.ratios.leverage === "number" ? b.ratios.leverage.toFixed(1) : b.ratios.leverage).padStart(8));
}
console.log("FY2022 rows scored on less than 100% of the weights:", partial, "of", ks.length);
