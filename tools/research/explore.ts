// Developer helper: node tools/research/explore.ts "query" [company]
import { readFileSync } from "node:fs";
import { buildIndex, search } from "../../src/lib/research/search.ts";
const keys = ["novartis", "astrazeneca", "gsk"];
const passages = keys.flatMap((c) => (JSON.parse(readFileSync(`public/research/passages-${c}.json`, "utf8")) as [number, string, string, string][]).map(([id, section, anchor, text]) => ({ id, company: c, section, anchor, text })));
const ix = buildIndex(passages);
const [q, company] = process.argv.slice(2);
for (const h of search(ix, q, { company, k: 4 })) console.log(`\n[${h.passage.company} #${h.passage.id}] score ${h.score.toFixed(1)} cov ${h.coverage.toFixed(2)} | ${h.passage.section}\n${h.passage.text.slice(0, 700)}`);
