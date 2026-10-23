// Pipeline v2: same three stages as ask.ts (guard, calculation, retrieval) with a stronger guard and the v2 search engine.
// v1 (ask.ts) is kept unchanged as the baseline the evaluation compares against.
import type { Dataset } from "../pharma/model.ts";
import { calculate, companiesIn, COMPANIES } from "./calc.ts";
import type { CalcAnswer } from "./calc.ts";
import { search2 } from "./search2.ts";
import type { Hit2, Index2 } from "./search2.ts";
import type { Refusal } from "./ask.ts";

/** Retrieval thresholds. Chosen on development set 2 only, then frozen before the blind set 3 was run. */
export const MIN_COVERAGE2 = 0.5;
export const MIN_SCORE2 = 6;

const ADVICE = /\b(should i|shall i|worth buying|good (buy|investment)|recommend(ed)?|buy or sell|sell or buy|undervalued|overvalued|price target)\b|\b(buy|sell)\b.*\b(shares?|stock)\b/i;
// "at the moment", "at present" and similar are live-data phrases, as are share/stock prices asked for without a past date.
const LIVE = /\b(today|right now|currently trading|live price|real[- ]time|this week|this morning|latest news|at the moment|at present|as of now|last night|yesterday|tonight)\b|\b(share|stock) price\b.*\b(now|current|latest)\b|\b(current|latest)\b.*\b(share|stock) price\b|\bmarket cap(italisation|italization)?\b.*\b(now|current|today)\b/i;
// Future: "will ...", forecasts, and any question about 2027 or later (the reports end in FY2025 and mention 2026 events).
const FORECAST = /\b(forecast|predict|projection|projected|going to (be|grow)|next (year|quarter)|by 20(2[6-9]|3\d))\b|\bwill\b|\bin 20(2[7-9]|3\d)\b|\bfor 20(2[7-9]|3\d)\b/i;
const OTHER_COMPANIES = /\b(sanofi|pfizer|merck|msd|roche|novo nordisk|eli lilly|lilly|johnson (&|and) johnson|j&j|bayer|abbvie|bristol|amgen|takeda|moderna|biontech|regeneron|gilead)\b/i;
// Questions that are not about the three companies' reports at all.
const OFF_TOPIC = /\b(restaurant|pizza|football|weather|recipe|horoscope|lyrics|movie|film)\b/i;

export type Answer2 = CalcAnswer | { kind: "passages"; hits: Hit2[] } | Refusal;

export function guard2(q: string): Refusal | null {
  if (ADVICE.test(q)) return { kind: "refusal", reason: "advice", message: "This tool does not give investment advice. It can show what the filings say and how the numbers are calculated." };
  if (LIVE.test(q)) return { kind: "refusal", reason: "live-data", message: "The documents are annual reports for FY2025. They contain no live or current market data." };
  if (FORECAST.test(q)) return { kind: "refusal", reason: "forecast", message: "The filings report what happened. They contain no forecasts this tool can cite, and it makes none of its own." };
  if (OTHER_COMPANIES.test(q)) return { kind: "refusal", reason: "not-covered", message: "Only the FY2025 Form 20-F reports of Novartis, AstraZeneca and GSK are searched, so questions that involve another company cannot be answered from them." };
  if (OFF_TOPIC.test(q)) return { kind: "refusal", reason: "not-covered", message: "This is not a question about the three annual reports." };
  return null;
}

export function ask2(q: string, ix: Index2, ds: Dataset): Answer2 {
  const g = guard2(q);
  if (g) return g;
  const calc = calculate(q, ds);
  if (calc) return calc;
  const named = companiesIn(q);
  const scored = Object.values(COMPANIES).reduce((t, c) => t.replace(new RegExp(c.aliases.source, "gi"), " "), q);
  const hits = search2(ix, scored, { company: named.length === 1 ? named[0] : undefined, k: 5 });
  const top = hits[0];
  if (!top || top.coverage < MIN_COVERAGE2 || top.score < MIN_SCORE2) {
    return { kind: "refusal", reason: "weak-evidence", message: "The reports do not appear to answer this: no passage matches enough of the question's key terms or their close synonyms. The nearest passages are shown so you can judge.", nearest: hits.slice(0, 3) as never };
  }
  return { kind: "passages", hits };
}
