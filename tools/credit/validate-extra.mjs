// Checks src/data/credit/extra.json and writes src/data/credit/validation.json.
//  1. Filing text check: each FY2025 figure must appear, as printed, in the company's 10-K text (data-raw/ma/<T>-10k.htm).
//     It proves the figure is in the filing and was not mis-scaled; it does not prove the right line was picked.
//  2. Consistency: current assets are not above total assets; liabilities + equity is close to assets; interest and capex are not negative.
// Companies whose 10-K was not downloaded are listed as unchecked, not passed. Run: node tools/credit/validate-extra.mjs
import fs from "node:fs";

const extra = JSON.parse(fs.readFileSync("src/data/credit/extra.json", "utf8"));
const ma = JSON.parse(fs.readFileSync("src/data/ma/dataset.json", "utf8"));
const checks = [];
const add = (company, check, ok, detail = "") => checks.push({ company, check, ok, detail });
const CHECKED = ["interest_expense", "interest_paid", "capex", "assets_current", "liabilities_current", "liabilities", "equity", "retained_earnings"];

const textCache = {};
function filingText(t) {
  const f = `data-raw/ma/${t}-10k.htm`;
  if (!fs.existsSync(f)) return null;
  return (textCache[t] ??= fs.readFileSync(f, "utf8").replace(/<ix:header>[\s\S]*?<\/ix:header>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#160;|&nbsp;/g, " ").replace(/\s+/g, " "));
}
const group = (n) => Math.round(n).toLocaleString("en-US");
function printed(valueMillions) {
  const a = Math.abs(valueMillions);
  return [...new Set([group(a * 1000), group(a), a.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ","), a.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")])];
}
const found = (text, forms) => forms.some((f) => new RegExp(`(?<![\\d,.])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d,]|\\.\\d)`).test(text));

const unchecked = [];
for (const [t, c] of Object.entries(extra.companies)) {
  const y = c.years["2025"];
  const assets = ma.companies[t]?.years["2025"]?.assets?.value ?? null;
  const text = filingText(t);
  if (!text) unchecked.push(t);
  else {
    for (const m of CHECKED) {
      const cell = y[m];
      if (!cell || Math.abs(cell.value) < 0.0005) continue;
      add(t, `FY2025 ${m} appears in the 10-K text`, found(text, printed(cell.value)), `${cell.value.toFixed(3)}m via ${cell.tag}`);
    }
  }
  const v = (m) => y[m]?.value ?? null;
  if (v("assets_current") !== null && assets !== null) add(t, "Current assets do not exceed total assets", v("assets_current") <= assets + 0.001);
  if (v("liabilities") !== null && v("equity") !== null && assets !== null) {
    const gap = Math.abs(v("liabilities") + v("equity") - assets) / assets;
    add(t, "Liabilities + equity is within 3% of total assets", gap <= 0.03, `${(gap * 100).toFixed(2)}% gap (a larger gap can be mezzanine equity or non-controlling interests)`);
  }
  for (const m of ["interest_expense", "interest_paid", "capex"]) if (v(m) !== null) add(t, `${m} is not negative`, v(m) >= 0);
  const ends = CHECKED.map((m) => y[m]?.end).filter(Boolean);
  if (ends.length) add(t, "All FY2025 extra figures share one period end", new Set(ends).size === 1, [...new Set(ends)].join(", "));
}
const failed = checks.filter((k) => !k.ok);
const out = { generated: new Date().toISOString().slice(0, 10), totals: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length, unchecked: unchecked.length }, unchecked, failed, checks };
fs.writeFileSync("src/data/credit/validation.json", JSON.stringify(out, null, 1));
console.log(out.totals);
for (const f of failed) console.log("FAIL", f.company, f.check, f.detail);
