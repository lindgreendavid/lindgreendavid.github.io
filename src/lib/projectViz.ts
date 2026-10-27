// Data pictures for the project index and the home page. Drawn from the same files the project pages use, at build time.
import pharma from "../data/pharma/dataset.json";
import ma from "../data/ma/dataset.json";
import summary from "../data/research/eval-summary.json";
import { comparable } from "./pharma/model.ts";
import type { Dataset as PharmaData } from "./pharma/model.ts";
import { run } from "./ma/screen.ts";
import type { Dataset as MaData } from "./ma/screen.ts";

export type BarRow = { label: string; share: number; text: string };

const names = { novartis: "Novartis", astrazeneca: "AstraZeneca", gsk: "GSK" } as const;

export const marginRows: BarRow[] = (Object.keys(names) as (keyof typeof names)[]).map((c) => {
  const v = comparable(pharma as unknown as PharmaData, c, 2025).operatingMargin;
  return { label: names[c], share: v / 0.5, text: `${(v * 100).toFixed(1)}%` };
});

// The dataset's names contain non-breaking spaces, so match any whitespace.
const nice = (n: string) => {
  const t = n.replace(/,?\s+(Inc|Corp|Corporation|plc|Ltd)\.?$/i, "").replace(/\s+Holdings$/i, "").replace(/\s+(Pharmaceuticals|Pharma|Therapeutics)$/i, "");
  return t.split(/\s+/).map((w, k) => (k === 0 && w.length <= 3 ? w.toUpperCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");
};

export const top5Rows: BarRow[] = run(ma as unknown as MaData)
  .ranked.slice(0, 5)
  .map((r) => ({ label: nice(r.s.row.name), share: r.s.score / 100, text: r.s.score.toFixed(0) }));

const shortName = (n: string) => n.split(/ \(|, /)[0];
export const evalRows: BarRow[] = summary.sets.map((x) => {
  const [k, n] = x.v21.overall.split("/").map(Number);
  return { label: shortName(x.name), share: k / n, text: x.v21.overall };
});
