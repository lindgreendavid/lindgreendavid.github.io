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

// ---------------------------------------------------------------- version 2.1: scope guard additions only (retrieval is identical to v2)
// Added after an external technical check reproduced two scope failures ("What is the capital of Switzerland?", "What is 2 plus 2?") and
// found that an undated share-price question retrieves a historical year-end table. The patterns below are still heuristics: they catch
// common out-of-scope question shapes, not every possible one.

const NUMBER_WORD = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|hundred";
const NUM = String.raw`(?:\d+(?:\.\d+)?|\b(?:${NUMBER_WORD})\b)`;
const OP = String.raw`(?:\+|\*|×|\bx\b|\bplus\b|\bminus\b|\btimes\b|\bdivided by\b|\bmultiplied by\b)`;
const ARITHMETIC = new RegExp(String.raw`${NUM}\s*${OP}\s*${NUM}`, "i");
const COUNTRIES = "afghanistan|argentina|australia|austria|belgium|brazil|britain|canada|chile|china|colombia|denmark|egypt|england|finland|france|germany|greece|india|indonesia|ireland|israel|italy|japan|mexico|netherlands|new zealand|norway|pakistan|peru|poland|portugal|russia|singapore|south africa|south korea|spain|sweden|switzerland|turkey|ukraine|united kingdom|united states|usa|vietnam";
const GEOGRAPHY = new RegExp(String.raw`\bcapital(?: city)? of (?:the )?(?:${COUNTRIES})\b|\bpopulation of (?:the )?(?:${COUNTRIES})\b|\bcurrency of (?:the )?(?:${COUNTRIES})\b`, "i");
const GENERAL_KNOWLEDGE = /\b(who (?:is|was) the (?:president|prime minister|king|queen)|tell me a joke|write (?:me )?a (?:poem|story|song)|translate\b|how tall is|how old is the (?:earth|universe)|speed of light|meaning of life|what is the (?:time|date)\b)/i;
// A share price or market value asked for without a date or year-end context: the reports only give year-end figures.
const UNDATED_PRICE = /\b(?:share|stock) price\b|\bmarket cap(?:italisation|italization)?\b|\bhow much (?:is|are) (?:the )?(?:novartis|astrazeneca|gsk|shares?|stock)\b/i;
const DATED_CONTEXT = /\b(?:year[- ]end|20(?:2[0-5])|31 december|december 31|high|low|per share|dividend|earnings|ratio|outstanding|number of)\b/i;

export function guard21(q: string): Refusal | null {
  const g = guard2(q);
  if (g) return g;
  if (ARITHMETIC.test(q)) return { kind: "refusal", reason: "not-covered", message: "This is an arithmetic question, not a question about the three annual reports. A calculator will do better." };
  if (GEOGRAPHY.test(q) || GENERAL_KNOWLEDGE.test(q)) return { kind: "refusal", reason: "not-covered", message: "This is a general-knowledge question, not a question about the three annual reports." };
  if (UNDATED_PRICE.test(q) && !DATED_CONTEXT.test(q)) return { kind: "refusal", reason: "live-data", message: "Share prices and market values change every day and the reports hold only year-end figures. Ask for a specific year-end (for example 'the Novartis year-end share price in 2025') or enter your own prices in the M&A workbench." };
  return null;
}

/** Version 2.1: identical retrieval to v2 with the extended scope guard. */
export function ask21(q: string, ix: Index2, ds: Dataset): Answer2 {
  const g = guard21(q);
  if (g) return g;
  return ask2(q, ix, ds);
}
