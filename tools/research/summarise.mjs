// Combines the per-set result files into src/data/research/eval-summary.json for the page and copies everything to the downloads folder.
import fs from "node:fs";

const dir = "src/data/research";
const sets = [
  { id: "dev", name: "Development set (41)", note: "Used while building v1.", q: "eval-questions.json", v1: "eval-results.json", v2: "eval-v2-results.json", v21: "eval-v21-results.json" },
  { id: "h1", name: "Held-out set 1 (26)", note: "Run once on frozen v1; questions close to the filing wording.", q: "eval-heldout-questions.json", v1: "eval-heldout-results.json", v2: "eval-heldout-v2-results.json", v21: "eval-heldout-v21-results.json" },
  { id: "h2", name: "Held-out set 2, paraphrased (30)", note: "Written before v2; used to design and tune v2, so it is v2's development set.", q: "eval-heldout2-questions.json", v1: "eval-heldout2-v1-results.json", v2: "eval-heldout2-v2-results.json", v21: "eval-heldout2-v21-results.json" },
  { id: "h3", name: "Held-out set 3, paraphrased (21)", note: "Written before v2 was designed and run once per engine. Its failures have since been seen by external reviewers, so it is no longer an untouched test for anything built next.", q: "eval-heldout3-questions.json", v1: "eval-heldout3-v1-results.json", v2: "eval-heldout3-v2-results.json", v21: "eval-heldout3-v21-results.json" },
  { id: "h4", name: "Set 4, paraphrased plus scope probes (24)", note: "Written by Claude on 2026-10-23 before v2.1 existed in evaluated form; run once on each engine. The only test written for v2.1; now also observed.", q: "eval-heldout4-questions.json", v1: "eval-heldout4-v1-results.json", v2: "eval-heldout4-v2-results.json", v21: "eval-heldout4-v21-results.json" },
];
const read = (f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
const pick = (r) => ({ questions: r.summary.questions, overall: r.summary.overallPass, lookupN: r.summary.lookup.n, top1: r.summary.lookup.hitAt1, top5: r.summary.lookup.hitAt5, refusedWrongly: r.summary.lookup.refusedWrongly, answerInTop1: r.summary.lookup.topPassageContainsGoldAnswer, unanswerable: r.summary.unanswerable.correctlyRefused, unanswerableN: r.summary.unanswerable.n });
const out = {
  generated: new Date().toISOString().slice(0, 10),
  note: "Correct-answer counts are overlapping views of the same questions: 'all correct' includes lookups, calculations and refusals; 'right passage first' counts lookups whose first passage contains the gold evidence string; 'first passage contains the gold answer' is a separate, weaker word-overlap heuristic, not a semantic judgement.",
  sets: sets.map((s) => ({ id: s.id, name: s.name, note: s.note, v1: pick(read(s.v1)), v2: pick(read(s.v2)), v21: pick(read(s.v21)), failuresV21: read(s.v21).failures.map((f) => ({ id: f.id, outcome: f.outcome, q: f.q })) })),
};
fs.writeFileSync(`${dir}/eval-summary.json`, JSON.stringify(out, null, 1));
fs.mkdirSync("public/downloads/research-assistant", { recursive: true });
for (const f of fs.readdirSync(dir).filter((x) => /^eval-.*\.json$/.test(x))) fs.copyFileSync(`${dir}/${f}`, `public/downloads/research-assistant/${f}`);
console.log(out.sets.map((s) => `${s.id}: v1 ${s.v1.overall} -> v2 ${s.v2.overall} -> v2.1 ${s.v21.overall}`).join("\n"));
