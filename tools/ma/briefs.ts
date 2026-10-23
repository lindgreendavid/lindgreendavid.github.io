import { readFileSync } from "node:fs";
import { compareBriefs } from "../../src/lib/ma/screen.ts";
const c = compareBriefs(JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")));
for (const r of c.results) console.log(r.brief.id, r.brief.name, `(${r.passed} pass)`, r.top.map((t) => `${t.rank}.${t.ticker}`).join(" "));
console.log("in all:", c.inAll.join(" "), "| in two of three:", c.inMajority.join(" "));
