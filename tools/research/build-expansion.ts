// Builds public/research/expansion.json: for each corpus term (Porter stem), its nearest neighbours by corpus co-occurrence.
// Method: random indexing. Every passage gets a sparse random vector; a term's vector is the tf-idf-weighted sum of the
// vectors of the passages it occurs in; neighbours are the terms with the highest cosine. No outside data, no model, seeded.
// Run: node tools/research/build-expansion.ts
import { readFileSync, writeFileSync } from "node:fs";
import { tokenize2 } from "../../src/lib/research/search2.ts";
import { rng } from "../../src/lib/ma/screen.ts";

const DIM = 384;
const NNZ = 10;
const keys = ["novartis", "astrazeneca", "gsk"];
const docs: string[][] = [];
for (const c of keys) for (const r of JSON.parse(readFileSync(`public/research/passages-${c}.json`, "utf8")) as [number, string, string, string][]) docs.push(tokenize2(`${r[1]} ${r[3]}`));

const df = new Map<string, number>();
for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
const N = docs.length;
const vocab = [...df.entries()].filter(([t, n]) => n >= 4 && n <= N * 0.15 && !/^\d/.test(t) && t.length > 2).map(([t]) => t);
const idx = new Map(vocab.map((t, i) => [t, i]));

const rand = rng(20261024);
const vec = vocab.map(() => new Float32Array(DIM));
for (const d of docs) {
  const pv = new Float32Array(DIM);
  for (let k = 0; k < NNZ; k++) pv[Math.floor(rand() * DIM)] += rand() < 0.5 ? 1 : -1;
  const tf = new Map<string, number>();
  for (const t of d) if (idx.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
  for (const [t, f] of tf) {
    const w = (1 + Math.log(f)) * Math.log(N / (df.get(t) as number));
    const v = vec[idx.get(t) as number];
    for (let j = 0; j < DIM; j++) v[j] += w * pv[j];
  }
}
for (const v of vec) {
  let n = 0;
  for (let j = 0; j < DIM; j++) n += v[j] * v[j];
  n = Math.sqrt(n) || 1;
  for (let j = 0; j < DIM; j++) v[j] /= n;
}
const out: Record<string, [string, number][]> = {};
for (let i = 0; i < vocab.length; i++) {
  const best: [number, number][] = [];
  for (let k = 0; k < vocab.length; k++) {
    if (k === i) continue;
    let s = 0;
    const a = vec[i];
    const b = vec[k];
    for (let j = 0; j < DIM; j++) s += a[j] * b[j];
    if (s >= 0.45) best.push([k, s]);
  }
  best.sort((x, y) => y[1] - x[1]);
  if (best.length) out[vocab[i]] = best.slice(0, 6).map(([k, s]) => [vocab[k], Math.round(s * 100) / 100]);
}
writeFileSync("public/research/expansion.json", JSON.stringify(out));
console.log(`vocabulary ${vocab.length}; terms with neighbours ${Object.keys(out).length}`);
for (const t of ["court", "acquir", "dividend", "lawsuit", "pension", "patent", "employe"]) console.log(t, JSON.stringify(out[t] ?? []));
