// Data pictures for the project index and the home page. Drawn from the same files the project pages use, at build time.
import pharma from "../data/pharma/dataset.json";
import ma from "../data/ma/dataset.json";
import summary from "../data/research/eval-summary.json";
import { comparable } from "./pharma/model.ts";
import type { Dataset as PharmaData } from "./pharma/model.ts";
import { run } from "./ma/screen.ts";
import { buildTargets, defaultTarget } from "./lbo/targets.ts";
import creditExtra from "../data/credit/extra.json";
import { BUCKETS, DEFAULT_OPTIONS as CREDIT_OPTIONS, buildRows as creditRowsFor } from "./credit/model.ts";
import type { Extra as CreditExtra } from "./credit/model.ts";
import type { Company as MaCompany } from "./ma/screen.ts";
import { inputsFor, irrGrid } from "./lbo/model.ts";
import type { Dataset as MaData } from "./ma/screen.ts";

export type BarRow = { label: string; share: number; text: string };

const names = { novartis: "Novartis", astrazeneca: "AstraZeneca", gsk: "GSK" } as const;

export const marginRows: BarRow[] = (Object.keys(names) as (keyof typeof names)[]).map((c) => {
  const v = comparable(pharma as unknown as PharmaData, c, 2025).operatingMargin;
  return { label: names[c], share: v / 0.5, text: `${(v * 100).toFixed(1)}%` };
});

import { nice } from "./names.ts";
export { nice };

export const top5Rows: BarRow[] = run(ma as unknown as MaData)
  .ranked.slice(0, 5)
  .map((r) => ({ label: nice(r.s.row.name), share: r.s.score / 100, text: r.s.score.toFixed(0) }));

const shortName = (n: string) => n.split(/ \(|, /)[0];
export const evalRows: BarRow[] = summary.sets.map((x) => {
  const [k, n] = x.v21.overall.split("/").map(Number);
  return { label: shortName(x.name), share: k / n, text: x.v21.overall };
});

// IRR of the default LBO case at five exit multiples, entry multiple held at the default.
const lboData = ma as unknown as MaData;
const lboInputs = inputsFor(defaultTarget(lboData, buildTargets(lboData)));
const lboExits = [-2, -1, 0, 1, 2].map((d) => lboInputs.exitMultiple + d);
const lboIrr = irrGrid(lboInputs, "entryMultiple", [lboInputs.entryMultiple], "exitMultiple", lboExits)[0];
export const lboRows: BarRow[] = lboExits.map((m, k) => ({ label: `Exit at ${m.toFixed(0)}x`, share: Math.max(0, (lboIrr[k] ?? 0) / 0.3), text: lboIrr[k] === null ? "n/a" : `${((lboIrr[k] as number) * 100).toFixed(0)}%` }));

// Credit screen: how many of the 28 companies fall in each strain band under the default settings.
const creditRows = creditRowsFor(Object.values((ma as unknown as MaData).companies) as MaCompany[], creditExtra as unknown as CreditExtra, CREDIT_OPTIONS);
export const creditBandRows: BarRow[] = BUCKETS.map((b) => {
  const n = creditRows.filter((r) => r.bucket === b.name).length;
  return { label: b.name.replace(" strain", ""), share: n / creditRows.length, text: String(n) };
});
