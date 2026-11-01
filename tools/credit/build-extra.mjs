// Builds src/data/credit/extra.json: the extra balance-sheet and cash-flow lines a credit screen needs (interest expense, current assets and
// liabilities, total liabilities, equity, retained earnings, capex) for the 28 companies of the M&A dataset, from the raw SEC files in data-raw/ma/.
// Same rules as tools/ma/build-dataset.mjs: annual 10-K facts, fiscal years FY2022 to FY2025, the latest filing wins, each value keeps its tag,
// accession and date, and anything not found stays null (never filled). Run: node tools/credit/build-extra.mjs
import fs from "node:fs";
import { UNIVERSE } from "../ma/universe.mjs";

const YEARS = [2022, 2023, 2024, 2025];
const days = (a, b) => (new Date(b) - new Date(a)) / 86400000;
const fiscalYear = (end) => new Date(new Date(end).getTime() - 14 * 86400000).getUTCFullYear();
const METRICS = {
  interest_expense: { flow: true, alts: [["InterestExpense"], ["InterestExpenseDebt"], ["InterestExpenseNonoperating"]] },
  interest_paid: { flow: true, alts: [["InterestPaidNet"], ["InterestPaid"]] },
  capex: { flow: true, alts: [["PaymentsToAcquirePropertyPlantAndEquipment"], ["PaymentsToAcquireProductiveAssets"]] },
  assets_current: { flow: false, alts: [["AssetsCurrent"]] },
  liabilities_current: { flow: false, alts: [["LiabilitiesCurrent"]] },
  liabilities: { flow: false, alts: [["Liabilities"]] },
  equity: { flow: false, alts: [["StockholdersEquity"], ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]] },
  retained_earnings: { flow: false, alts: [["RetainedEarningsAccumulatedDeficit"]] },
};

function rows(facts, tag, flow, year) {
  const f = facts.facts["us-gaap"]?.[tag]?.units?.USD;
  if (!f) return [];
  return f.filter((x) => x.form === "10-K" && x.end && fiscalYear(x.end) === year && (flow ? x.start && Math.abs(days(x.start, x.end) - 365) <= 10 : !x.start));
}
function latest(rs) {
  if (!rs.length) return null;
  rs.sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : a.end < b.end ? -1 : 1));
  return rs[rs.length - 1];
}
const valueOf = (facts, alt, flow, year) => {
  const r = latest(rows(facts, alt[0], flow, year));
  return r ? { val: r.val, tag: alt[0], accn: r.accn, filed: r.filed, end: r.end } : null;
};

const out = { generated: new Date().toISOString().slice(0, 10), units: "US dollars, millions", years: YEARS, companies: {} };
for (const [ticker] of UNIVERSE) {
  const facts = JSON.parse(fs.readFileSync(`data-raw/ma/${ticker}.json`, "utf8"));
  const years = {};
  for (const [metric, rule] of Object.entries(METRICS)) {
    let best = null;
    rule.alts.forEach((alt, i) => {
      const n = YEARS.filter((y) => valueOf(facts, alt, rule.flow, y)).length;
      if (n && (!best || n > best.n)) best = { alt, n, i };
    });
    for (const y of YEARS) {
      years[y] ??= {};
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
      years[y][metric] = v ? { value: v.val / 1e6, tag: v.tag, accn: v.accn, filed: v.filed, end: v.end, ...(note ? { note } : {}) } : null;
    }
  }
  out.companies[ticker] = { ticker, years };
}
fs.writeFileSync("src/data/credit/extra.json", JSON.stringify(out, null, 1));
// coverage report
const cov = {};
for (const m of Object.keys(METRICS)) cov[m] = Object.values(out.companies).filter((c) => c.years[2025][m]).length;
console.log("FY2025 coverage out of", UNIVERSE.length, cov);
