// Deterministic answers to numerical questions. No retrieval and no language model: the question is matched to a fixed set of
// metrics and the answer is computed from the reconciled dataset with the same functions as the valuation project.
import { comparable, YEARS } from "../pharma/model.ts";
import type { Comparable, Dataset, Year } from "../pharma/model.ts";
import { tokenize } from "./search.ts";

export const COMPANIES: Record<string, { name: string; aliases: RegExp }> = {
  novartis: { name: "Novartis", aliases: /\bnovartis\b/i },
  astrazeneca: { name: "AstraZeneca", aliases: /\b(astrazeneca|astra zeneca|azn?)\b/i },
  gsk: { name: "GSK", aliases: /\b(gsk|glaxosmithkline|glaxo smith kline)\b/i },
};

export function companiesIn(q: string): string[] {
  return Object.entries(COMPANIES)
    .filter(([, c]) => c.aliases.test(q))
    .map(([k]) => k);
}

type Metric = {
  key: string;
  label: string;
  match: RegExp;
  kind: "money" | "pct" | "ratio";
  get: (c: Comparable) => number | undefined;
  how: string;
};

// Most specific first: the first matching entry wins.
const METRICS: Metric[] = [
  { key: "fcfAfterIntangibles", label: "free cash flow after intangible purchases", match: /free cash flow after intangible/i, kind: "money", get: (c) => c.fcfAfterIntangibles, how: "operating cash flow - purchases of PP&E - purchases of intangible assets" },
  { key: "fcfPpe", label: "free cash flow", match: /free cash ?flow|\bfcf\b/i, kind: "money", get: (c) => c.fcfPpe, how: "operating cash flow - purchases of property, plant and equipment" },
  { key: "cashConversion", label: "cash conversion", match: /cash conversion/i, kind: "ratio", get: (c) => c.cashConversion, how: "operating cash flow / profit for the year from continuing operations" },
  { key: "cfo", label: "operating cash flow", match: /(operating|operations) cash ?flow|cash flows? from operating/i, kind: "money", get: (c) => c.cfo, how: "reported net cash flow from operating activities" },
  { key: "netDebt", label: "net debt including leases", match: /net debt/i, kind: "money", get: (c) => c.netDebt, how: "financial debt incl. lease liabilities - cash - liquid investments" },
  { key: "rndIntensity", label: "R&D as a share of revenue", match: /(r&d|r and d|research( and development)?)[^?]*(share|percent|percentage|%|intensity|ratio|of revenue|of sales)|research intensity|r&d intensity/i, kind: "pct", get: (c) => c.rndIntensity, how: "research and development expense / revenue" },
  { key: "effectiveTaxRate", label: "effective tax rate", match: /(effective )?tax rate/i, kind: "pct", get: (c) => c.effectiveTaxRate, how: "income tax / profit before tax" },
  { key: "operatingMargin", label: "operating margin", match: /operating margin|operating profit margin/i, kind: "pct", get: (c) => c.operatingMargin, how: "operating profit / revenue" },
  { key: "profitMargin", label: "profit margin", match: /(net|profit) margin/i, kind: "pct", get: (c) => c.profitMargin, how: "profit for the year from continuing operations / revenue" },
  { key: "revenueGrowth", label: "revenue growth", match: /(revenue|sales) growth|growth in (revenue|sales)|did (revenue|sales) (grow|increase)|grew/i, kind: "pct", get: (c) => c.revenueGrowth, how: "revenue / prior-year revenue - 1" },
  { key: "operatingProfit", label: "operating profit", match: /operating (profit|income)/i, kind: "money", get: (c) => c.operatingProfit, how: "reported operating profit" },
  { key: "revenue", label: "revenue", match: /\b(total )?(revenue|turnover)\b|net sales|\bsales\b/i, kind: "money", get: (c) => c.revenue, how: "reported revenue" },
];

const SUPERLATIVE = /\b(which|highest|largest|biggest|lowest|smallest|most|least|best)\b/i;
const LOWEST = /\b(lowest|smallest|least)\b/i;

export type CalcAnswer = {
  kind: "calc";
  text: string;
  steps: string[];
  rows: { company: string; value: string; raw: number }[];
  /** Pointer to the reconciled dataset, not to text passages. */
  basis: string;
};

const fmt = (m: Metric, v: number, cur: string) =>
  m.kind === "pct" ? `${(v * 100).toFixed(1)}%` : m.kind === "ratio" ? `${v.toFixed(2)}x` : `${cur}${Math.round(v).toLocaleString("en-US")}m`;

export function parseYear(q: string): Year {
  const m = q.match(/\b(?:fy\s?)?(20(?:23|24|25))\b/i);
  return (m ? Number(m[1]) : 2025) as Year;
}

// Words that may accompany a metric without changing what is asked.
const FILLER = new Set(tokenize("fy three companies company end percentage percent share amount reported incl including excluding leases lease operations cash all compare which highest largest biggest lowest smallest most least best intensity"));

/** True when every content word in the question is the metric, a company or a year, so nothing else (a product, a region) is being asked about. */
function isPlainMetricQuestion(q: string, metric: Metric): boolean {
  const allowed = new Set([...tokenize(`${metric.label} ${metric.how}`), ...FILLER]);
  const cleaned = Object.values(COMPANIES).reduce((t, c) => t.replace(new RegExp(c.aliases.source, "gi"), " "), q).replace(/['’]s\b/g, "").replace(/\b(fy)?20\d\d\b/gi, " ");
  return tokenize(cleaned).every((t) => allowed.has(t));
}

/** Returns an answer when the question is one of the supported numerical or comparison questions, otherwise null. */
export function calculate(q: string, ds: Dataset): CalcAnswer | null {
  const metric = METRICS.find((m) => m.match.test(q));
  if (!metric) return null;
  if (!isPlainMetricQuestion(q, metric)) return null;
  const year = parseYear(q);
  if (!YEARS.includes(year)) return null;
  const named = companiesIn(q);
  const superlative = SUPERLATIVE.test(q);
  // Without a named company or a comparison cue the question is about something else (a product, a segment): leave it to retrieval.
  if (!named.length && !superlative) return null;
  const compare = superlative || named.length !== 1;
  const subjects = compare ? Object.keys(COMPANIES) : named;
  // Money is compared in US dollars so the three companies are on one basis; a single company is also shown in its own currency.
  // Growth is computed in each company's reporting currency so that exchange-rate movements do not count as growth.
  const mode = metric.key === "revenueGrowth" ? "local" : "usd";
  const rows = subjects.map((c) => ({ company: c, raw: metric.get(comparable(ds, c, year, mode)) }));
  if (rows.some((r) => r.raw === undefined || !Number.isFinite(r.raw))) return null;
  const rowsOut = rows.map((r) => ({ company: COMPANIES[r.company].name, raw: r.raw as number, value: fmt(metric, r.raw as number, "USD ") }));
  const steps = [`Metric: ${metric.label} = ${metric.how}.`, mode === "local" ? `Basis: FY${year}, reconciled dataset; growth in each company's reporting currency (Novartis and AstraZeneca USD, GSK GBP).` : `Basis: FY${year}, reconciled dataset; money in US dollars (GSK translated at ECB reference rates).`];
  let text: string;
  if (!compare) {
    const c = subjects[0];
    const cur = ds.companies[c].currency;
    text = `${COMPANIES[c].name}'s ${metric.label} for FY${year} was ${rowsOut[0].value}`;
    if (metric.kind === "money" && cur !== "USD") {
      const lv = metric.get(comparable(ds, c, year, "local"))!;
      text += ` (${cur} ${Math.round(lv).toLocaleString("en-US")}m as reported)`;
    }
    text += ".";
  } else if (superlative) {
    const sorted = [...rowsOut].sort((a, b) => (LOWEST.test(q) ? a.raw - b.raw : b.raw - a.raw));
    text = `${sorted[0].company} has the ${LOWEST.test(q) ? "lowest" : "highest"} ${metric.label} in FY${year}: ${sorted[0].value}. ${sorted
      .slice(1)
      .map((r) => `${r.company} ${r.value}`)
      .join(", ")}.`;
  } else {
    text = `${metric.label[0].toUpperCase()}${metric.label.slice(1)}, FY${year}: ${rowsOut.map((r) => `${r.company} ${r.value}`).join("; ")}.`;
  }
  return { kind: "calc", text, steps, rows: rowsOut, basis: "src/data/pharma/dataset.json (SEC XBRL, reconciled to rendered filing pages)" };
}
