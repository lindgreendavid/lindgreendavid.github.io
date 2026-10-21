// Developer helper: node tools/ma/preview.ts — prints the default screen.
import { readFileSync } from "node:fs";
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS, memo, run } from "../../src/lib/ma/screen.ts";
import type { Dataset } from "../../src/lib/ma/screen.ts";
const ds = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
const o = run(ds, DEFAULT_WEIGHTS, DEFAULT_FILTERS);
for (const r of o.ranked) {
  const s = o.sens.perTicker[r.ticker];
  console.log(String(r.rank).padStart(2), r.ticker.padEnd(5), r.s.score.toFixed(1).padStart(5), `cov ${r.s.coverage.toFixed(2)}`, `rank ${s.p5}-${s.p95} med ${s.median} top5 ${(s.top5Share * 100).toFixed(0)}%`, `0pol ${s.zeroPolicyRank}`, `flags ${r.s.row.flags.length}`);
}
console.log("excluded:", o.excluded.map((e) => `${e.row.ticker}`).join(" "));
console.log(memo(o, ds, Object.keys(ds.companies).length).join("\n"));
