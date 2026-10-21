// Builds src/data/ma/dataset.json from the raw SEC files in data-raw/ma/.
// Rules: annual (about 365 days), Form 10-K, fiscal years FY2022 to FY2025 by period end date; when several filings report the
// same period the LATEST filing wins. Each value keeps its XBRL tag, accession and filing date. A tag is chosen per metric by
// priority list and the SAME tag is used for all years of a company where possible, so growth is not an artefact of a tag change.
// Anything not found stays missing (null): it is never filled with zero or an estimate.
import fs from "node:fs";
import { UNIVERSE } from "./universe.mjs";

const YEARS = [2022, 2023, 2024, 2025];
const days = (a, b) => (new Date(b) - new Date(a)) / 86400000;

// Alternatives in priority order. Each alternative is a list of us-gaap tags that are summed; a tag starting with "?" is optional
// (absent means nothing to add), every other tag must be present. `flow` = a duration of about a year, otherwise a year-end balance.
const METRICS = {
  revenue: { flow: true, alts: [["Revenues"], ["RevenueFromContractWithCustomerExcludingAssessedTax"], ["RevenueFromContractWithCustomerIncludingAssessedTax"], ["SalesRevenueNet"]] },
  operating_income: { flow: true, alts: [["OperatingIncomeLoss"]] },
  net_income: { flow: true, alts: [["NetIncomeLoss"], ["ProfitLoss"]] },
  rnd: { flow: true, alts: [["ResearchAndDevelopmentExpense"], ["ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"]] },
  cfo: { flow: true, alts: [["NetCashProvidedByUsedInOperatingActivities"], ["NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"]] },
  da: { flow: true, alts: [["DepreciationDepletionAndAmortization"], ["DepreciationAndAmortization"], ["DepreciationAmortizationAndAccretionNet"], ["DepreciationAmortizationAndOther"], ["Depreciation", "AmortizationOfIntangibleAssets"]] },
  cash: { flow: false, alts: [["CashAndCashEquivalentsAtCarryingValue"], ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]] },
  debt: {
    flow: false,
    alts: [["LongTermDebt"], ["DebtLongtermAndShorttermCombinedAmount"], ["LongTermDebtNoncurrent", "?LongTermDebtCurrent"], ["LongTermDebtAndCapitalLeaseObligations", "?LongTermDebtAndCapitalLeaseObligationsCurrent"], ["ConvertibleLongTermNotesPayable", "?LongTermLoansPayable", "?LoansPayableCurrent"], ["LongTermLoansPayable", "?LoansPayableCurrent"], ["ConvertibleNotesPayable"], ["SeniorNotes"], ["NotesPayable"], ["DebtInstrumentCarryingAmount"], ["LongTermDebtCurrent"]],
  },
  st_investments: { flow: false, alts: [["MarketableSecuritiesCurrent"], ["ShortTermInvestments"], ["AvailableForSaleSecuritiesDebtSecuritiesCurrent"], ["DebtSecuritiesAvailableForSaleExcludingAccruedInterestCurrent"]] },
  assets: { flow: false, alts: [["Assets"]] },
};

// Fiscal year of a period end. Shifting back 14 days keeps 52/53-week years (Exelixis FY2025 ends 2026-01-02) in the right year.
const fiscalYear = (end) => new Date(new Date(end).getTime() - 14 * 86400000).getUTCFullYear();

function rows(facts, tag, flow, year) {
  const f = facts.facts["us-gaap"]?.[tag]?.units?.USD;
  if (!f) return [];
  return f.filter((x) => x.form === "10-K" && x.end && fiscalYear(x.end) === year && (flow ? x.start && Math.abs(days(x.start, x.end) - 365) <= 10 : !x.start));
}

function latest(rs) {
  if (!rs.length) return null;
  // Latest filing wins; among facts of the same filing the one that ends last.
  rs.sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : a.end < b.end ? -1 : 1));
  return rs[rs.length - 1];
}

/** Value of one alternative for one year, or null when a required tag is missing. */
function valueOf(facts, alt, flow, year) {
  const parts = [];
  for (const raw of alt) {
    const optional = raw.startsWith("?");
    const tag = optional ? raw.slice(1) : raw;
    const r = latest(rows(facts, tag, flow, year));
    if (!r) {
      if (optional) continue;
      return null;
    }
    parts.push({ tag, r });
  }
  if (!parts.length) return null;
  return {
    val: parts.reduce((s, p) => s + p.r.val, 0),
    tag: parts.map((p) => p.tag).join(" + "),
    accn: [...new Set(parts.map((p) => p.r.accn))].join(", "),
    filed: parts.map((p) => p.r.filed).sort().pop(),
    end: parts[0].r.end,
  };
}

const out = { generated: new Date().toISOString().slice(0, 10), units: "US dollars, millions", years: YEARS, companies: {}, issues: [] };

for (const [ticker, cik] of UNIVERSE) {
  const facts = JSON.parse(fs.readFileSync(`data-raw/ma/${ticker}.json`, "utf8"));
  const sub = JSON.parse(fs.readFileSync(`data-raw/ma/${ticker}.submissions.json`, "utf8"));
  const c = { ticker, cik, name: facts.entityName, sic: sub.sic, sicDescription: sub.sicDescription, exchanges: sub.exchanges, fiscalYearEnd: sub.fiscalYearEnd, years: {} };
  // The alternative with the most years of data is used for every year; another alternative fills a year only if the chosen one cannot, and says so.
  for (const [metric, rule] of Object.entries(METRICS)) {
    let best = null;
    rule.alts.forEach((alt, i) => {
      const n = YEARS.filter((y) => valueOf(facts, alt, rule.flow, y)).length;
      if (n && (!best || n > best.n)) best = { alt, n, i };
    });
    for (const y of YEARS) {
      c.years[y] ??= {};
      let v = best ? valueOf(facts, best.alt, rule.flow, y) : null;
      let note;
      if (!v) {
        for (const alt of rule.alts) {
          v = valueOf(facts, alt, rule.flow, y);
          if (v) {
            note = `different tag used for FY${y}`;
            break;
          }
        }
      }
      c.years[y][metric] = v ? { value: v.val / 1e6, tag: v.tag, accn: v.accn, filed: v.filed, end: v.end, ...(note ? { note } : {}) } : null;
    }
  }
  // Debt-like obligations that standard debt tags miss. Custom taxonomy tags are not in the company-facts feed, so the 10-K text is checked
  // for royalty-financing language; when found, the screen treats leverage as unavailable rather than showing a misleading figure.
  const doc = `data-raw/ma/${ticker}-10k.htm`;
  if (fs.existsSync(doc)) {
    const text = fs.readFileSync(doc, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (/royalty financing obligation|liabilit(y|ies) related to (the )?sale of future royalt|sale of future royalt(y|ies)/i.test(text)) c.debtLike = "The 10-K mentions royalty-financing or sale-of-future-royalties obligations that are not in the debt figure";
    c.docChecked = true;
  } else c.docChecked = false;
  out.companies[ticker] = c;
}

// Report gaps for the record (they are not filled).
for (const [t, c] of Object.entries(out.companies)) {
  for (const y of [2025]) for (const [m, v] of Object.entries(c.years[y])) if (!v && m !== "st_investments") out.issues.push(`${t} FY${y}: ${m} not found`);
}
fs.mkdirSync("src/data/ma", { recursive: true });
fs.writeFileSync("src/data/ma/dataset.json", JSON.stringify(out, null, 1));
console.log(`companies ${Object.keys(out.companies).length}; FY2025 gaps ${out.issues.length}`);
console.log(out.issues.join("\n"));
