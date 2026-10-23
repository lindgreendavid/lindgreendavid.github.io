// Checks src/data/ma/dataset.json and writes src/data/ma/validation.json.
//  1. Filing text check: each FY2025 figure must appear, as printed, in the company's 10-K text (data-raw/ma/<T>-10k.htm).
//     It proves the figure is in the filing and was not mis-scaled; it does not prove the right line was picked.
//  2. Consistency checks: fiscal-year dates, one accession for the core FY2025 values, sign and size sanity.
// Companies whose 10-K was not downloaded are listed as unchecked, not passed.
import fs from "node:fs";

const ds = JSON.parse(fs.readFileSync("src/data/ma/dataset.json", "utf8"));
const checks = [];
const add = (company, check, ok, detail = "") => checks.push({ company, check, ok, detail });
const CHECKED = ["revenue", "operating_income", "net_income", "cfo", "cash", "rnd", "debt"];

const textCache = {};
function filingText(t) {
  const f = `data-raw/ma/${t}-10k.htm`;
  if (!fs.existsSync(f)) return null;
  return (textCache[t] ??= fs.readFileSync(f, "utf8").replace(/<ix:header>[\s\S]*?<\/ix:header>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#160;|&nbsp;/g, " ").replace(/\s+/g, " "));
}
const group = (n) => Math.round(n).toLocaleString("en-US");
/** Ways a US-dollar amount can be printed: whole thousands, whole millions, or millions with one or two decimals. */
function printed(valueMillions) {
  const a = Math.abs(valueMillions);
  const forms = new Set([group(a * 1000), group(a), a.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ","), a.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")]);
  return [...forms];
}
const found = (text, forms) => forms.some((f) => new RegExp(`(?<![\\d,.])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d,]|\\.\\d)`).test(text));

const unchecked = [];
const sums = [];
for (const [t, c] of Object.entries(ds.companies)) {
  const y = c.years["2025"];
  const text = filingText(t);
  if (!text) unchecked.push(t);
  else {
    for (const m of CHECKED) {
      const cell = y[m];
      if (!cell) continue;
      // Zero (no balance) is printed as a dash, so it cannot be searched for.
      if (Math.abs(cell.value) < 0.0005) continue;
      // A sum of several tags is a total the filing may not print; it is listed, not searched.
      if (cell.tag.startsWith("balance sheet:")) {
        sums.push(`${t} ${m}: read from the balance sheet, checked in balance-sheet-validation.json`);
        continue;
      }
      if (cell.tag.includes(" + ")) {
        sums.push(`${t} ${m}: ${cell.tag}`);
        continue;
      }
      add(t, `FY2025 ${m} appears in the 10-K text`, found(text, printed(cell.value)), `${cell.value.toFixed(3)}m via ${cell.tag}`);
    }
  }
  // Cover-page share count: the exact number must be printed in the 10-K (skipped when several classes were summed).
  if (text && c.shares && c.shares.classes === 1) {
    const printedShares = Math.round(c.shares.value * 1e6).toLocaleString("en-US");
    // Some covers print the count in thousands (Halozyme: "118,017").
    const inThousands = Math.round(c.shares.value * 1e3).toLocaleString("en-US");
    add(t, "Cover-page share count appears in the 10-K text", text.includes(printedShares) || text.includes(`(in thousands) of the registrant’s common stock, par value $0.001 per share, was ${inThousands}`) || (c.shares.value * 1e6) % 1000 === 0 && text.includes(` ${inThousands} as of`), printedShares);
  }
  if (!c.shares) add(t, "Has a cover-page share count", false);
  const ends = Object.entries(y).filter(([, v]) => v && ["revenue", "operating_income", "cfo"].includes(Object.keys(y).find((k) => y[k] === v))).map(([, v]) => v.end);
  add(t, "FY2025 period ends between 1 Dec 2025 and 5 Jan 2026", ends.every((e) => e >= "2025-12-01" && e <= "2026-01-05"), ends.join(", "));
  const accns = new Set([y.revenue, y.operating_income, y.cfo].filter(Boolean).map((v) => v.accn));
  add(t, "Core FY2025 values come from one filing", accns.size <= 1, [...accns].join(", "));
  if (y.revenue) add(t, "Revenue is positive and below $50bn", y.revenue.value > 0 && y.revenue.value < 50000);
  if (y.revenue && y.operating_income) add(t, "Operating margin is between -500% and 100%", Math.abs(y.operating_income.value / y.revenue.value) <= 5 && y.operating_income.value <= y.revenue.value);
  if (y.cash) add(t, "Cash is not negative", y.cash.value >= 0);
  if (y.revenue && c.years["2022"].revenue) add(t, "FY2022 revenue period ends in 2022 or the first days of 2023", c.years["2022"].revenue.end >= "2022-12-01" && c.years["2022"].revenue.end <= "2023-01-05", c.years["2022"].revenue.end);
}
// D&A must not omit separately reported intangible amortisation: for every company and year where an intangible-amortisation tag exists,
// the selected D&A must be at least as large (this is how the Halozyme and Jazz omissions are caught; companies whose combined tag
// already includes it pass). A failure means "check the cash-flow statement", not necessarily an error.
const fiscalYear = (end) => new Date(new Date(end).getTime() - 14 * 86400000).getUTCFullYear();
for (const [t, c] of Object.entries(ds.companies)) {
  const f = `data-raw/ma/${t}.json`;
  if (!fs.existsSync(f)) continue;
  const g = JSON.parse(fs.readFileSync(f, "utf8")).facts["us-gaap"] ?? {};
  for (const y of [2022, 2023, 2024, 2025]) {
    const da = c.years[String(y)]?.da;
    let it = 0;
    for (const tag of ["AmortizationOfIntangibleAssets", "AmortizationOfAcquiredIntangibleAssets"]) {
      const rows = (g[tag]?.units?.USD ?? []).filter((x) => x.form === "10-K" && x.start && Math.abs((new Date(x.end) - new Date(x.start)) / 864e5 - 365) <= 10 && fiscalYear(x.end) === y).sort((a, b) => (a.filed < b.filed ? -1 : 1));
      if (rows.length) it = Math.max(it, rows[rows.length - 1].val / 1e6);
    }
    if (it > 0.5 && da) add(t, `FY${y} D&A (${da.value.toFixed(1)}m) is not below the separate intangible amortisation (${it.toFixed(1)}m)`, da.value >= it - 0.0005);
  }
}
const failed = checks.filter((c) => !c.ok);
const filing = checks.filter((c) => c.check.includes("10-K text"));
const out = {
  generated: new Date().toISOString().slice(0, 10),
  totals: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length, filingTextChecks: filing.length, filingTextPassed: filing.filter((c) => c.ok).length },
  uncheckedAgainstFilingText: unchecked,
  summedValuesNotSearched: sums,
  failures: failed,
  results: checks,
  notes: [
    "The filing-text check shows each figure is printed in the 10-K; it does not prove the correct line was chosen. Zero balances are printed as dashes and are not searched.",
    "Debt-like obligations outside the standard debt tags (royalty financing) are detected from the 10-K text and make leverage unavailable for those companies.",
  ],
};
fs.writeFileSync("src/data/ma/validation.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.totals), "unchecked:", unchecked.join(" "));
for (const f of failed) console.log("FAIL", f.company, f.check, f.detail);
