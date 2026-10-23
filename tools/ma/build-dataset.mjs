// Builds src/data/ma/dataset.json from the raw SEC files in data-raw/ma/.
// Rules: annual (about 365 days), Form 10-K, fiscal years FY2022 to FY2025 by period end date; when several filings report the
// same period the LATEST filing wins. Each value keeps its XBRL tag, accession and filing date. A tag is chosen per metric by
// priority list and the SAME tag is used for all years of a company where possible, so growth is not an artefact of a tag change.
// Anything not found stays missing (null): it is never filled with zero or an estimate.
import fs from "node:fs";
import { UNIVERSE } from "./universe.mjs";

const YEARS = [2022, 2023, 2024, 2025];
/** Statement-confirmed D&A components, used instead of the generic priority list (see the comment where it is applied). */
const DA_SEPARATE_INTANGIBLES = {
  HALO: [["DepreciationDepletionAndAmortization", "AmortizationOfIntangibleAssets"]],
  JAZZ: [["Depreciation", "AmortizationOfIntangibleAssets"]],
};
const days = (a, b) => (new Date(b) - new Date(a)) / 86400000;

// Debt policy: the CARRYING amount on the balance sheet (net of unamortised discount and issuance costs), current plus non-current, excluding
// operating leases. Principal (face) amounts are not used. "DebtInstrumentCarryingAmount" is last in the list because companies often tag
// principal under that name (BioMarin: 600.0 principal vs 597.176 carrying); "ConvertibleDebt" is the balance-sheet carrying tag.
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
    alts: [["LongTermDebt"], ["DebtLongtermAndShorttermCombinedAmount"], ["LongTermDebtNoncurrent", "?LongTermDebtCurrent"], ["LongTermDebtAndCapitalLeaseObligations", "?LongTermDebtAndCapitalLeaseObligationsCurrent"], ["ConvertibleLongTermNotesPayable", "?LongTermLoansPayable", "?LoansPayableCurrent"], ["LongTermLoansPayable", "?LoansPayableCurrent"], ["ConvertibleNotesPayable"], ["ConvertibleDebt"], ["SeniorNotes"], ["NotesPayable"], ["DebtInstrumentCarryingAmount"], ["LongTermDebtCurrent"]],
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

const curated = JSON.parse(fs.readFileSync("src/data/ma/balance-sheet-debt.json", "utf8"));
const coverShares = JSON.parse(fs.readFileSync("src/data/ma/cover-shares.json", "utf8"));
const eq = JSON.parse(fs.readFileSync("src/data/ma/earnings-quality.json", "utf8"));
const manual = JSON.parse(fs.readFileSync("src/data/ma/manual-values.json", "utf8"));
const out = { generated: new Date().toISOString().slice(0, 10), units: "US dollars, millions", years: YEARS, companies: {}, issues: [] };

for (const [ticker, cik] of UNIVERSE) {
  const facts = JSON.parse(fs.readFileSync(`data-raw/ma/${ticker}.json`, "utf8"));
  const sub = JSON.parse(fs.readFileSync(`data-raw/ma/${ticker}.submissions.json`, "utf8"));
  const c = { ticker, cik, name: facts.entityName, sic: sub.sic, sicDescription: sub.sicDescription, exchanges: sub.exchanges, fiscalYearEnd: sub.fiscalYearEnd, years: {} };
  // The alternative with the most years of data is used for every year; another alternative fills a year only if the chosen one cannot, and says so.
  for (const [metric, baseRule] of Object.entries(METRICS)) {
    // Companies whose cash-flow statement lists intangible amortisation SEPARATELY from the depreciation line must have both summed
    // (a combined D&A tag would otherwise omit it). Confirmed from the cash-flow statements for Halozyme and Jazz; every other company's
    // selected D&A is checked by validate-dataset.mjs to be at least as large as its separate intangible-amortisation tag.
    const rule = metric === "da" && DA_SEPARATE_INTANGIBLES[ticker] ? { ...baseRule, alts: DA_SEPARATE_INTANGIBLES[ticker] } : baseRule;
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
  // Shares outstanding from the 10-K cover page (dei:EntityCommonStockSharesOutstanding), the latest filing's latest date.
  const sh = (facts.facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? []).filter((x) => x.form === "10-K" && x.end >= "2025-12-01");
  if (sh.length) {
    const filed = sh.map((x) => x.filed).sort().pop();
    const rows = sh.filter((x) => x.filed === filed);
    const end = rows.map((x) => x.end).sort().pop();
    const last = rows.filter((x) => x.end === end);
    c.shares = { value: last.reduce((s, x) => s + x.val, 0) / 1e6, end, filed, accn: last[0].accn, classes: last.length };
  }
  if (!c.shares && coverShares.companies[ticker]) {
    const o = coverShares.companies[ticker];
    c.shares = { value: o.value, end: o.end, filed: c.years[2025].revenue?.filed ?? "", accn: c.years[2025].revenue?.accn ?? "", classes: 1, note: o.note };
  }
  // Debt read from the 10-K balance sheet text where the standard tags miss it (see balance-sheet-debt.json and verify-balance-sheet.mjs).
  const bs = curated.companies[ticker];
  if (bs) {
    const y25 = c.years[2025];
    y25.debt = { value: bs.debt, tag: `balance sheet: ${bs.basis}`, accn: y25.revenue?.accn ?? "", filed: y25.revenue?.filed ?? "", end: y25.revenue?.end ?? "", note: "read from the 10-K balance sheet text" };
    if (bs.debtLike.length) c.debtLikeItems = bs.debtLike.map((l) => ({ label: l.label, value: l.value }));
  }
  // Figures the standard tags did not carry, read from the 10-K text (manual-values.json; re-checked by verify-balance-sheet.mjs).
  for (const [metric, mv] of Object.entries(manual.companies[ticker] ?? {})) {
    const y25 = c.years[2025];
    y25[metric] = { value: mv.value, tag: `10-K text: ${mv.basis}`, accn: y25.revenue?.accn ?? "", filed: y25.revenue?.filed ?? "", end: y25.revenue?.end ?? "", note: "read from the 10-K text" };
  }
  if (eq.companies[ticker]) c.oneOffs = eq.companies[ticker].oneOffs.map((o) => ({ label: o.label, value: o.value }));
  const doc = `data-raw/ma/${ticker}-10k.htm`;
  c.docChecked = fs.existsSync(doc);
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
