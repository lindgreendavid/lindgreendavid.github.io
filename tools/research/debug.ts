// Developer helper: node tools/research/debug.ts "query" [company]  — shows scoring details for the top hits.
import { readFileSync } from "node:fs";
import { buildIndex, search, tokenize, idf } from "../../src/lib/research/search.ts";
const keys = ["novartis", "astrazeneca", "gsk"];
const passages = keys.flatMap((c) => (JSON.parse(readFileSync(`src/data/research/passages-${c}.json`, "utf8")) as [number, string, string, string][]).map(([id, section, anchor, text]) => ({ id, company: c, section, anchor, text })));
const ix = buildIndex(passages);
const [q, company] = process.argv.slice(2);
console.log([...new Set(tokenize(q))].map((t) => `${t}:${idf(ix, t).toFixed(1)}(df ${ix.df.get(t) ?? 0})`).join("  "));
for (const h of search(ix, q, { company, k: 4 })) console.log(`#${h.passage.id} score ${h.score.toFixed(1)} cov ${h.coverage.toFixed(2)} anchor ${h.anchor?.term}:${h.anchor?.present} | ${h.passage.section.slice(0, 60)} | ${h.passage.text.slice(0, 80).replace(/\n/g, " ")}`);
