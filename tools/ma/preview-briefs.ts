// Prints the three-brief comparison. Run: node tools/ma/preview-briefs.ts
import { readFileSync } from "node:fs";
import { compareBriefs } from "../../src/lib/ma/screen.ts";
import type { Dataset } from "../../src/lib/ma/screen.ts";
const ds = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
const c = compareBriefs(ds);
console.log("in all three top fives:", c.inAll.join(", "), "| in a majority:", c.inMajority.join(", "));
for (const r of c.results) console.log(r.brief.name, r.passed, r.top.map((t) => t.ticker).join(" "));
