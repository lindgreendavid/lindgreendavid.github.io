// Developer helper: node tools/research/debug2.ts "question" [company] — top v2 hits with coverage and score.
import { readFileSync } from "node:fs";
import { buildIndex2, search2, concepts } from "../../src/lib/research/search2.ts";
const keys = ["novartis", "astrazeneca", "gsk"];
const passages = keys.flatMap((c) => (JSON.parse(readFileSync(`public/research/passages-${c}.json`, "utf8")) as [number, string, string, string][]).map(([id, section, anchor, text]) => ({ id, company: c, section, anchor, text })));
const ix = buildIndex2(passages, JSON.parse(readFileSync("public/research/expansion.json", "utf8")));
const [q, company] = process.argv.slice(2);
console.log(concepts(ix, q).map((c) => `${c.term}(${c.idf.toFixed(1)}): ${c.alts.map(([a, w]) => `${a}@${w.toFixed(2)}`).slice(0, 6).join(" ")}`).join("\n"));
for (const h of search2(ix, q, { company, k: 4 })) console.log(`#${h.passage.id} [${h.passage.company}] score ${h.score.toFixed(1)} cov ${h.coverage.toFixed(2)} | ${h.passage.section.slice(0, 50)} | ${h.passage.text.slice(0, 90).replace(/\n/g, " ")}`);
