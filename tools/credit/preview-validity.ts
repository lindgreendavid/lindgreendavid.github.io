// Prints the robustness and validity checks for the credit screen. Run: node tools/credit/preview-validity.ts
import { readFileSync } from "node:fs";
import { DEFAULT_OPTIONS, compact, rankRows, rowFor, validityChecks, weightRobustness } from "../../src/lib/credit/model.ts";
import type { Extra } from "../../src/lib/credit/model.ts";
import type { Company, Dataset } from "../../src/lib/ma/screen.ts";

const ds = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
const extra = JSON.parse(readFileSync("src/data/credit/extra.json", "utf8")) as Extra;
const ks = (Object.values(ds.companies) as Company[]).map((c) => compact(c, extra.companies[c.ticker]));
const rows = rankRows(ks.map((k) => rowFor(k, 2025, DEFAULT_OPTIONS)));
const rb = weightRobustness(rows);
const stable = Object.values(rb.perTicker).filter((x) => x.sameBand >= 0.9).length;
console.log("companies keeping their band in >=90% of", rb.draws, "re-weightings:", stable, "of", Object.keys(rb.perTicker).length);
for (const [t, x] of Object.entries(rb.perTicker).filter(([, x]) => x.sameBand < 0.9)) console.log(" ", t, "same band", (x.sameBand * 100).toFixed(0) + "%", "rank", x.rank, "range", x.rankLo.toFixed(0) + "-" + x.rankHi.toFixed(0));
for (const v of validityChecks(ks, DEFAULT_OPTIONS)) console.log(v.label, "n", v.n, "rho", v.rho?.toFixed(2), "p", v.p?.toFixed(3));
