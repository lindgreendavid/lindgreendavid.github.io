// Runs the evaluation set through the real pipeline and writes src/data/research/eval-results.json.
// Run: node tools/research/eval.ts [questions-file results-file]   (Node >= 22.18 strips the types)
// Default: the development set. The held-out set is run with: node tools/research/eval.ts eval-heldout-questions.json eval-heldout-results.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ask, MIN_COVERAGE, MIN_SCORE } from "../../src/lib/research/ask.ts";
import { buildIndex } from "../../src/lib/research/search.ts";
import type { Passage } from "../../src/lib/research/search.ts";
import type { Dataset } from "../../src/lib/pharma/model.ts";

const keys = ["novartis", "astrazeneca", "gsk"];
const passages: Passage[] = keys.flatMap((c) =>
  (JSON.parse(readFileSync(`src/data/research/passages-${c}.json`, "utf8")) as [number, string, string, string][]).map(([id, section, anchor, text]) => ({ id, company: c, section, anchor, text })),
);
const ix = buildIndex(passages);
const ds = JSON.parse(readFileSync("src/data/pharma/dataset.json", "utf8")) as Dataset;
const QFILE = `src/data/research/${process.argv[2] ?? "eval-questions.json"}`;
const RFILE = `src/data/research/${process.argv[3] ?? "eval-results.json"}`;
const { questions } = JSON.parse(readFileSync(QFILE, "utf8")) as { questions: Q[] };

type Q = { id: string; type: "lookup" | "calculation" | "comparison" | "unanswerable"; company: string; q: string; gold: string; evidence?: string; expect?: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

// The gold evidence must exist in the extracted filing text, otherwise the question itself is wrong.
const invalid: string[] = [];
for (const q of questions) {
  if (q.type !== "lookup") continue;
  const pool = passages.filter((p) => q.company === "all" || p.company === q.company);
  if (!pool.some((p) => norm(p.text).includes(norm(q.evidence!)))) invalid.push(q.id);
}
if (invalid.length) {
  console.error("Gold evidence not found in the filing text for:", invalid.join(", "));
  process.exit(1);
}

type Row = { id: string; type: Q["type"]; q: string; outcome: string; pass: boolean; rank?: number; detail: string };
const rows: Row[] = questions.map((q) => {
  const a = ask(q.q, ix, ds);
  if (q.type === "unanswerable") {
    return { id: q.id, type: q.type, q: q.q, outcome: a.kind === "refusal" ? `refused (${a.reason})` : `answered (${a.kind})`, pass: a.kind === "refusal", detail: a.kind === "passages" ? `${a.hits[0].passage.company} #${a.hits[0].passage.id} ${a.hits[0].passage.section}` : a.kind === "calc" ? a.text : "" };
  }
  if (q.type === "lookup") {
    if (a.kind !== "passages") return { id: q.id, type: q.type, q: q.q, outcome: a.kind === "refusal" ? `refused (${a.reason})` : "calculation instead", pass: false, detail: a.kind === "calc" ? a.text : "" };
    const rank = a.hits.findIndex((h) => norm(h.passage.text).includes(norm(q.evidence!))) + 1;
    return { id: q.id, type: q.type, q: q.q, outcome: rank === 1 ? "hit@1" : rank ? `hit@${rank}` : "miss", pass: rank === 1, rank: rank || undefined, detail: rank ? "" : `top: ${a.hits[0].passage.company} #${a.hits[0].passage.id} ${a.hits[0].passage.section}` };
  }
  if (a.kind !== "calc") return { id: q.id, type: q.type, q: q.q, outcome: a.kind === "refusal" ? `refused (${a.reason})` : "passages instead", pass: false, detail: "" };
  const ok = q.expect!.every((e) => a.text.includes(e));
  return { id: q.id, type: q.type, q: q.q, outcome: ok ? "match" : "wrong", pass: ok, detail: ok ? "" : a.text };
});

const by = (t: Q["type"]) => rows.filter((r) => r.type === t);
const share = (r: Row[], f: (x: Row) => boolean) => `${r.filter(f).length}/${r.length}`;
const lookups = by("lookup");
const summary = {
  questions: rows.length,
  lookup: { n: lookups.length, hitAt1: share(lookups, (r) => r.rank === 1), hitAt5: share(lookups, (r) => r.rank !== undefined), refusedWrongly: share(lookups, (r) => r.outcome.startsWith("refused")) },
  calculation: { n: by("calculation").length, exact: share(by("calculation"), (r) => r.pass) },
  comparison: { n: by("comparison").length, correct: share(by("comparison"), (r) => r.pass) },
  unanswerable: { n: by("unanswerable").length, correctlyRefused: share(by("unanswerable"), (r) => r.pass) },
  overallPass: share(rows, (r) => r.pass),
};
const out = { ran: new Date().toISOString().slice(0, 10), thresholds: { MIN_COVERAGE, MIN_SCORE }, passages: passages.length, summary, failures: rows.filter((r) => !r.pass), rows };
const prev = existsSync(RFILE) ? JSON.parse(readFileSync(RFILE, "utf8")) : {};
writeFileSync(RFILE, JSON.stringify({ ...out, firstRun: prev.firstRun ?? { ran: out.ran, summary, failures: out.failures.map((f) => `${f.id}: ${f.outcome}`) }, changesAfterFirstRun: prev.changesAfterFirstRun ?? [] }, null, 1));
console.log(JSON.stringify(summary, null, 1));
for (const f of out.failures) console.log(`FAIL ${f.id} [${f.type}] ${f.outcome} | ${f.q} | ${f.detail}`);
