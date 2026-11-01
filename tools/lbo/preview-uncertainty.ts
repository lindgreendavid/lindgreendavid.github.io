// Prints the Monte Carlo and tornado for the default case, to sanity-check them. Run: node tools/lbo/preview-uncertainty.ts
import { readFileSync } from "node:fs";
import { buildTargets, defaultTarget } from "../../src/lib/lbo/targets.ts";
import { inputsFor, monteCarlo, tornado } from "../../src/lib/lbo/model.ts";
import type { Dataset } from "../../src/lib/ma/screen.ts";

const data = JSON.parse(readFileSync("src/data/ma/dataset.json", "utf8")) as Dataset;
const t = defaultTarget(data, buildTargets(data));
const i = inputsFor(t);
const m = monteCarlo(i, { draws: 3000, seed: 1 });
const pc = (x: number) => (x * 100).toFixed(1) + "%";
console.log(t.name, "p5", pc(m.p5), "p25", pc(m.p25), "p50", pc(m.p50), "p75", pc(m.p75), "p95", pc(m.p95), "loss", pc(m.probLoss), "<10", pc(m.probBelow10), ">=20", pc(m.probAbove20));
for (const r of tornado(i).rows) console.log(r.driver.padEnd(30), r.low === null ? "n/a" : pc(r.low), r.high === null ? "n/a" : pc(r.high));
