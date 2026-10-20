// The research assistant's pipeline. Three separate stages, each testable on its own:
//   1. scope guard   - refuses what the documents cannot support (advice, live prices, forecasts, other companies)
//   2. calculation   - deterministic answer for numerical questions from the reconciled dataset
//   3. retrieval     - ranked source passages; refuses when the best passage covers too little of the question
// There is no text generation: the answer to a lookup question is the passage itself, shown with its source.
import type { Dataset } from "../pharma/model.ts";
import { calculate, companiesIn, COMPANIES } from "./calc.ts";
import type { CalcAnswer } from "./calc.ts";
import { search } from "./search.ts";
import type { Hit, Index } from "./search.ts";

/** Thresholds fixed before the evaluation was first run (see the notes in eval/questions.json). */
export const MIN_COVERAGE = 0.6;
export const MIN_SCORE = 5;

const ADVICE = /\b(should i|shall i|worth buying|good (buy|investment)|recommend(ed)?|buy or sell|sell or buy|undervalued|overvalued|price target)\b|\b(buy|sell)\b.*\b(shares?|stock)\b/i;
const LIVE = /\b(today|right now|currently trading|live price|real[- ]time|this week|this morning|latest news)\b|\b(share|stock) price\b.*\b(now|current|latest)\b|\b(current|latest)\b.*\b(share|stock) price\b/i;
const FORECAST = /\b(forecast|predict|projection|projected|going to (be|grow)|next (year|quarter)|by 20(2[6-9]|3\d))\b|\bwill\b.*\b(be|grow|reach|rise|fall|earn|make)\b/i;
const OTHER_COMPANIES = /\b(sanofi|pfizer|merck|msd|roche|novo nordisk|eli lilly|lilly|johnson (&|and) johnson|bayer|abbvie|bristol|amgen|takeda|moderna|biontech|regeneron|gilead)\b/i;

export type Refusal = {
  kind: "refusal";
  reason: "advice" | "live-data" | "forecast" | "not-covered" | "weak-evidence";
  message: string;
  nearest?: Hit[];
};
export type PassageAnswer = { kind: "passages"; hits: Hit[] };
export type Answer = CalcAnswer | PassageAnswer | Refusal;

export function guard(q: string): Refusal | null {
  if (ADVICE.test(q)) return { kind: "refusal", reason: "advice", message: "This tool does not give investment advice. It can show what the filings say and how the numbers are calculated." };
  if (LIVE.test(q)) return { kind: "refusal", reason: "live-data", message: "The documents are annual reports for FY2025. They contain no live or current market data." };
  if (FORECAST.test(q)) return { kind: "refusal", reason: "forecast", message: "The filings report what happened. They contain no forecasts this tool can cite, and it makes none of its own." };
  if (OTHER_COMPANIES.test(q) && companiesIn(q).length === 0) return { kind: "refusal", reason: "not-covered", message: "Only the FY2025 Form 20-F reports of Novartis, AstraZeneca and GSK are searched." };
  return null;
}

export function ask(q: string, ix: Index, ds: Dataset): Answer {
  const g = guard(q);
  if (g) return g;
  const calc = calculate(q, ds);
  if (calc) return calc;
  const named = companiesIn(q);
  // Company names select the filing; they are not evidence, so they are removed from the scored query.
  const scored = Object.values(COMPANIES).reduce((t, c) => t.replace(new RegExp(c.aliases.source, "gi"), " "), q);
  const hits = search(ix, scored, { company: named.length === 1 ? named[0] : undefined, k: 5 });
  const top = hits[0];
  if (!top || top.coverage < MIN_COVERAGE || top.score < MIN_SCORE || top.anchor?.present === false) {
    return { kind: "refusal", reason: "weak-evidence", message: "The reports do not appear to answer this: no passage contains enough of the question's key terms. The nearest passages are shown so you can judge.", nearest: hits.slice(0, 3) };
  }
  return { kind: "passages", hits };
}
