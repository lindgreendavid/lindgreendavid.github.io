// Combines the per-set result files into src/data/research/eval-summary.json for the page and copies everything to the downloads folder.
import fs from "node:fs";

const dir = "src/data/research";
const sets = [
  { id: "dev", name: "Development set", note: "Used while building v1; optimistic for v1.", v1: "eval-results.json", v2: "eval-v2-results.json", q: "eval-questions.json" },
  { id: "h1", name: "Held-out set 1", note: "Run once on frozen v1; questions written close to the filing wording.", v1: "eval-heldout-results.json", v2: "eval-heldout-v2-results.json", q: "eval-heldout-questions.json" },
  { id: "h2", name: "Held-out set 2 (paraphrased)", note: "Written before v2. Used to design and tune v2, so it is v2's development set.", v1: "eval-heldout2-v1-results.json", v2: "eval-heldout2-v2-results.json", q: "eval-heldout2-questions.json" },
  { id: "h3", name: "Held-out set 3 (blind, paraphrased)", note: "Written before v2 was designed; run once on frozen v1 and once on frozen v2.", v1: "eval-heldout3-v1-results.json", v2: "eval-heldout3-v2-results.json", q: "eval-heldout3-questions.json" },
];
const read = (f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
const pick = (r) => ({ questions: r.summary.questions, overall: r.summary.overallPass, lookupN: r.summary.lookup.n, top1: r.summary.lookup.hitAt1, top5: r.summary.lookup.hitAt5, refusedWrongly: r.summary.lookup.refusedWrongly, unanswerable: r.summary.unanswerable.correctlyRefused, unanswerableN: r.summary.unanswerable.n, calc: `${r.summary.calculation.exact}, ${r.summary.comparison.correct}` });
const out = { generated: new Date().toISOString().slice(0, 10), sets: sets.map((s) => ({ id: s.id, name: s.name, note: s.note, v1: pick(read(s.v1)), v2: pick(read(s.v2)), failuresV2: read(s.v2).failures.map((f) => ({ id: f.id, outcome: f.outcome, q: f.q })) })) };
fs.writeFileSync(`${dir}/eval-summary.json`, JSON.stringify(out, null, 1));
fs.mkdirSync("public/downloads/research-assistant", { recursive: true });
for (const f of fs.readdirSync(dir).filter((x) => /^eval-.*\.json$/.test(x))) fs.copyFileSync(`${dir}/${f}`, `public/downloads/research-assistant/${f}`);
console.log(out.sets.map((s) => `${s.id}: v1 ${s.v1.overall} -> v2 ${s.v2.overall}`).join("\n"));
