// Prints the credit screen for the default options, to sanity-check the numbers. Run: node tools/credit/preview.ts
import { readFileSync } from "node:fs";
import { buildRows, rankRows } from "../../src/lib/credit/model.ts";
import type { Extra } from "../../src/lib/credit/model.ts";
import type { Company, Dataset } from "../../src/lib/ma/screen.ts";

const ds = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
const extra = JSON.parse(readFileSync("src/data/credit/extra.json", "utf8")) as Extra;
const rows = rankRows(buildRows(Object.values(ds.companies) as Company[], extra));
const f = (x: unknown, d = 1) => (typeof x === "number" ? x.toFixed(d) : String(x));
for (const r of rows) {
  console.log(
    [r.ticker.padEnd(5), f(r.score, 0).padStart(3), (r.bucket ?? "-").padEnd(10), "lev", f(r.ratios.leverage).padStart(8), "cov", f(r.ratios.coverage).padStart(8), "fcf/d", f(r.ratios.fcfToDebt, 2).padStart(8), "liq", f(r.ratios.liquidity, 2).padStart(7), "head", r.headroom ? f(r.headroom.value * 100, 0) + "%" + r.headroom.binding[0] : "n/a", "stress", f(r.stressedScore, 0), r.stressedBucket, "Z''", r.altman ? f(r.altman.z) + " " + r.altman.zone : "n/a", "flags", r.flags.length].join(" "),
  );
}
