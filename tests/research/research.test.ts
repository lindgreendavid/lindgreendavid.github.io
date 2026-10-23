// Run: node --test tests/research/research.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildIndex, search, tokenize } from "../../src/lib/research/search.ts";
import type { Passage } from "../../src/lib/research/search.ts";
import { calculate, companiesIn } from "../../src/lib/research/calc.ts";
import { ask, guard } from "../../src/lib/research/ask.ts";
import type { Dataset } from "../../src/lib/pharma/model.ts";

const ds = JSON.parse(readFileSync("src/data/pharma/dataset.json", "utf8")) as Dataset;
const mk = (id: number, company: string, section: string, text: string): Passage => ({ id, company, section, anchor: "", text });
const tiny = buildIndex([
  mk(0, "novartis", "Employees", "Novartis had 75 267 full-time equivalent employees at year end."),
  mk(1, "novartis", "Dividends", "The dividend per share was CHF 3.70 for the year."),
  mk(2, "gsk", "Auditor", "Deloitte LLP is the external auditor of the company."),
  mk(3, "gsk", "Risk", "Supply chain disruption could affect product availability and costs."),
]);

test("tokenize: lowercases, drops stop words, joins thousands separators, stems plurals and tenses", () => {
  assert.deepEqual(tokenize("What were the 1,234 Employees?"), ["1234", "employ"]);
  assert.equal(tokenize("declared")[0], tokenize("declare")[0]);
  assert.equal(tokenize("incorporated")[0], tokenize("incorporation")[0]);
});

test("search ranks the passage that contains the query terms first", () => {
  const hits = search(tiny, "dividend per share", { k: 3 });
  assert.equal(hits[0].passage.id, 1);
  assert.ok(hits[0].coverage > 0.99);
});

test("search honours the company filter", () => {
  const hits = search(tiny, "auditor", { company: "novartis" });
  assert.equal(hits.length, 0);
});

test("coverage counts terms that appear nowhere in the corpus", () => {
  const hits = search(tiny, "dividend zebra", { k: 1 });
  assert.ok(hits[0].coverage < 0.6);
});

test("companiesIn recognises names and aliases", () => {
  assert.deepEqual(companiesIn("How did AZ and GlaxoSmithKline compare?").sort(), ["astrazeneca", "gsk"]);
});

test("calculate: single company metric matches hand arithmetic", () => {
  assert.match(calculate("What was Novartis's operating margin in 2025?", ds)!.text, /31\.1%/); // 17,644 / 56,674
  assert.match(calculate("What was Novartis's free cash flow in 2025?", ds)!.text, /17,596/); // 19,144 - 1,548
});

test("calculate: growth is in reporting currency, not translated", () => {
  assert.match(calculate("What was GSK's revenue growth in 2025?", ds)!.text, /4\.1%/); // 32,667 / 31,376 - 1 in GBP
});

test("calculate: comparison names the winner", () => {
  assert.match(calculate("Which company had the lowest net debt including leases in 2025?", ds)!.text, /^GSK has the lowest/);
});

test("calculate: leaves questions about a product or segment to retrieval", () => {
  assert.equal(calculate("What were net sales in the Novartis oncology therapeutic area in 2025?", ds), null);
  assert.equal(calculate("What were Kisqali sales in 2025?", ds), null);
});

test("guard: advice, live data, forecasts and uncovered companies are refused with a reason", () => {
  assert.equal(guard("Should I buy GSK shares?")?.reason, "advice");
  assert.equal(guard("What is AstraZeneca's share price today?")?.reason, "live-data");
  assert.equal(guard("What will Novartis's operating margin be in 2028?")?.reason, "forecast");
  assert.equal(guard("What was Sanofi's revenue in 2025?")?.reason, "not-covered");
  assert.equal(guard("What was Novartis's revenue?"), null);
});

test("ask: refuses when the question's key terms are not in the best passage", () => {
  const a = ask("temperature in Basel on a Tuesday", tiny, ds);
  assert.equal(a.kind, "refusal");
});

test("ask: a documents-only question returns the filing's own passages, never generated text", () => {
  const real = buildIndex(["novartis", "astrazeneca", "gsk"].flatMap((c) => (JSON.parse(readFileSync(`public/research/passages-${c}.json`, "utf8")) as [number, string, string, string][]).map(([id, section, anchor, text]) => ({ id, company: c, section, anchor, text }))));
  const a = ask("In which jurisdiction is AstraZeneca incorporated?", real, ds);
  assert.equal(a.kind, "passages");
  if (a.kind === "passages") assert.ok(a.hits.every((h) => h.passage.company === "astrazeneca"));
});

test("evaluation sets: sizes, unique ids and gold evidence present in the extracted filings", () => {
  const dev = JSON.parse(readFileSync("src/data/research/eval-questions.json", "utf8")).questions as { id: string; type: string; company: string; evidence?: string }[];
  const held = JSON.parse(readFileSync("src/data/research/eval-heldout-questions.json", "utf8")).questions as typeof dev;
  assert.ok(dev.length >= 30, "at least 30 questions in the development set");
  const ids = [...dev, ...held].map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  const text: Record<string, string> = {};
  for (const c of ["novartis", "astrazeneca", "gsk"]) text[c] = norm((JSON.parse(readFileSync(`public/research/passages-${c}.json`, "utf8")) as [number, string, string, string][]).map((r) => r[3]).join(" "));
  for (const q of [...dev, ...held].filter((x) => x.type === "lookup")) assert.ok(text[q.company].includes(norm(q.evidence!)), `${q.id}: evidence not found`);
  for (const t of ["lookup", "calculation", "unanswerable"]) assert.ok(dev.some((q) => q.type === t), `development set has ${t} questions`);
});

// ---- v2 engine ----
import { porter } from "../../src/lib/research/porter.ts";
import { buildIndex2, concepts, search2, tokenize2 } from "../../src/lib/research/search2.ts";
import { ask2, guard2 } from "../../src/lib/research/ask2.ts";

test("porter: textbook examples and shared stems", () => {
  const cases: Record<string, string> = { caresses: "caress", ponies: "poni", relational: "relat", conditional: "condit", generalization: "gener", agreed: "agre", motoring: "motor", happy: "happi" };
  for (const [w, s] of Object.entries(cases)) assert.equal(porter(w), s, w);
  assert.equal(porter("acquired"), porter("acquires"));
  assert.equal(porter("restricting"), porter("restrictions"));
});

test("v2 concepts: a synonym joins the same concept at a discount and never counts twice", () => {
  const ix = buildIndex2([mk(0, "gsk", "Legal", "The court dismissed the lawsuit in July."), mk(1, "gsk", "Other", "Sales grew strongly.")]);
  const cs = concepts(ix, "litigation");
  assert.equal(cs.length, 1);
  assert.ok(cs[0].alts.some(([t, w]) => t === porter("lawsuit") && w < 1));
  const hits = search2(ix, "litigation");
  assert.equal(hits[0].passage.id, 0);
  assert.ok(hits[0].coverage > 0.5 && hits[0].coverage < 1);
});

test("v2 guard: 'will', far-future years, 'at the moment' and uncovered companies are refused", () => {
  assert.equal(guard2("What dividend will GSK pay in 2029?")?.reason, "forecast");
  assert.equal(guard2("How many patients will take Kisqali in 2030?")?.reason, "forecast");
  assert.equal(guard2("What is AstraZeneca's stock price at the moment?")?.reason, "live-data");
  assert.equal(guard2("How does Roche's revenue compare with Novartis?")?.reason, "not-covered");
  assert.equal(guard2("What was the Novartis dividend per share in 2025?"), null);
});

test("v2 answers a paraphrased question that v1 refuses", () => {
  const real = buildIndex2(["novartis", "astrazeneca", "gsk"].flatMap((c) => (JSON.parse(readFileSync(`public/research/passages-${c}.json`, "utf8")) as [number, string, string, string][]).map(([id, section, anchor, text]) => ({ id, company: c, section, anchor, text }))));
  const a = ask2("Who runs the British pension scheme of AstraZeneca?", real, ds);
  assert.equal(a.kind, "passages");
  if (a.kind === "passages") assert.ok(a.hits.some((h) => h.passage.text.includes("The UK Pension Fund is governed and administered by a corporate Trustee")));
  assert.equal(ask2("What is the best pizza restaurant in Frankfurt?", real, ds).kind, "refusal");
});

test("evaluation files: summary matches the per-set result files", () => {
  const sm = JSON.parse(readFileSync("src/data/research/eval-summary.json", "utf8")) as { sets: { id: string; v2: { overall: string; questions: number } }[] };
  assert.equal(sm.sets.length, 5);
  assert.equal(sm.sets.reduce((a, x) => a + x.v2.questions, 0), 142);
  const h3 = JSON.parse(readFileSync("src/data/research/eval-heldout3-v2-results.json", "utf8")) as { summary: { overallPass: string }; engine: string };
  assert.equal(h3.engine, "v2");
  assert.equal(sm.sets[3].v2.overall, h3.summary.overallPass);
  const h4 = JSON.parse(readFileSync("src/data/research/eval-heldout4-v21-results.json", "utf8")) as { summary: { overallPass: string }; engine: string };
  assert.equal(h4.engine, "v21");
  assert.equal(sm.sets[4].v21.overall, h4.summary.overallPass);
});

// ---- v2.1 scope guard ----
import { ask21, guard21 } from "../../src/lib/research/ask2.ts";

test("v2.1 guard: arithmetic, geography, general knowledge and undated prices are refused; dated or per-share questions are not", () => {
  for (const q of ["What is the capital of Switzerland?", "What is 2 plus 2?", "What is 15 times 4?", "What is two times three?", "What is the population of Germany?", "Who is the president of the United States?", "What is the AstraZeneca share price?", "What is the Novartis market capitalisation?"]) assert.equal(guard21(q)?.kind, "refusal", q);
  assert.equal(guard21("What is the AstraZeneca share price?")?.reason, "live-data");
  for (const q of ["What was the Novartis year-end share price in 2025?", "What is the share capital of Novartis?", "What was the highest Novartis share price in 2025 in Swiss francs?", "What were Novartis earnings per share in 2025?", "How many shares were outstanding at 31 December 2025?", "Which company had the highest operating margin in 2025?"]) assert.equal(guard21(q), null, q);
});

test("v2.1 equals v2 for questions the extended guard does not touch", () => {
  const real = buildIndex2(["novartis", "astrazeneca", "gsk"].flatMap((c) => (JSON.parse(readFileSync(`public/research/passages-${c}.json`, "utf8")) as [number, string, string, string][]).map(([id, section, anchor, text]) => ({ id, company: c, section, anchor, text }))));
  const q = "In which jurisdiction is AstraZeneca incorporated?";
  assert.deepEqual(JSON.stringify(ask21(q, real, ds)), JSON.stringify(ask2(q, real, ds)));
});
