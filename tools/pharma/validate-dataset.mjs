// Validates the dataset: reconciliation to filing pages, accounting identities, units, restatement report.
// Exits non-zero if any hard check fails. Writes src/data/pharma/validation.json.
import fs from "node:fs";
import path from "node:path";
import { YEARS } from "./companies.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const ds = JSON.parse(fs.readFileSync(path.join(root, "src/data/pharma/dataset.json"), "utf8"));
const rec = JSON.parse(fs.readFileSync(path.join(root, "src/data/pharma/reconciliation.json"), "utf8"));
const raw = (id) => JSON.parse(fs.readFileSync(path.join(root, `data/pharma/raw/raw-${id}.json`), "utf8"));
const checks = [];
const add = (group, name, pass, detail) => checks.push({ group, name, pass, detail });
const val = (c, y, m) => ds.companies[c].years[y]?.[m]?.value;

// 1. Reconciliation to filing pages (tolerance 0.5 for rounding in millions).
let recTotal = 0;
let recMiss = 0;
for (const it of rec.items) {
  for (const [y, parts] of Object.entries(it.v)) {
    const want = parts.reduce((a, b) => a + b, 0);
    const got = val(it.c, y, it.m);
    recTotal++;
    const ok = got !== undefined && Math.abs(got - want) <= 0.5;
    if (!ok) recMiss++;
    add("reconciliation", `${it.c} ${y} ${it.m}`, ok, ok ? `${got} = statement ${want}` : `dataset ${got} vs statement ${want} (${it.line})`);
  }
}

// 1b. GSK: project net debt (borrowings less cash) reconciles to the company-reported figure through the two items the project omits.
{
  const ref = ds.companies.gsk.reference;
  const projectNetDebt = val("gsk", "2025", "debt_financial") - val("gsk", "2025", "cash");
  const viaItems = projectNetDebt + ref.liabilitiesRelatingToAssetsHeldForSale2025.value - ref.liquidInvestments2025.value;
  add("identity", "gsk 2025: project net debt + held-for-sale liabilities - liquid investments = company-reported net debt", Math.abs(viaItems - ref.reportedNetDebt2025.value) <= 0.5, `${projectNetDebt} + ${ref.liabilitiesRelatingToAssetsHeldForSale2025.value} - ${ref.liquidInvestments2025.value} = ${viaItems} vs reported ${ref.reportedNetDebt2025.value}`);
  add("identity", "gsk 2025: lease liabilities inside borrowings (137 + 693) equal the 830 in the dataset note", ref.leaseLiabilitiesInBorrowings2025.shortTerm + ref.leaseLiabilitiesInBorrowings2025.longTerm === 830, "137 + 693 = 830");
}

// 2. Accounting identities.
for (const c of Object.keys(ds.companies)) {
  for (const y of YEARS) {
    const pre = val(c, y, "pretax_profit");
    const tax = val(c, y, "income_tax");
    const pr = val(c, y, "profit_continuing");
    add("identity", `${c} ${y}: profit before tax - tax = profit`, Math.abs(pre - tax - pr) <= 1.5, `${pre} - ${tax} = ${pre - tax} vs ${pr}`);
    const rev = val(c, y, "revenue");
    const op = val(c, y, "operating_profit");
    add("units", `${c} ${y}: revenue and operating profit plausible (millions)`, rev > 10000 && rev < 100000 && Math.abs(op) < rev, `revenue ${rev}, operating profit ${op}`);
  }
}
// Novartis: reported net debt equals financial debt less cash and liquid investments.
{
  const f = raw("novartis").facts["ifrs-full"].NetDebt?.units.USD ?? [];
  for (const y of YEARS) {
    const rows = f.filter((x) => /^20-F/.test(x.form) && x.end === `${y}-12-31`).sort((a, b) => (a.filed < b.filed ? -1 : 1));
    const reported = rows.length ? rows[rows.length - 1].val / 1e6 : undefined;
    const mine = val("novartis", y, "debt_financial") - val("novartis", y, "cash") - val("novartis", y, "liquid_investments");
    add("identity", `novartis ${y}: financial debt - cash - liquid investments = company-reported net debt`, reported !== undefined && Math.abs(mine - reported) <= 1, `${mine} vs reported ${reported}`);
  }
}
// AstraZeneca: borrowings (incl. leases) = financial debt + leases; D&A excluding impairment is below the cash-flow D&A-and-impairment line.
for (const y of YEARS) {
  const a = val("astrazeneca", y, "borrowings_incl_leases");
  const b = val("astrazeneca", y, "debt_financial") + val("astrazeneca", y, "lease_liabilities");
  add("identity", `astrazeneca ${y}: borrowings incl. leases = financial debt + leases`, Math.abs(a - b) < 0.5, `${a} vs ${b}`);
}
{
  const cf = { 2025: 5733, 2024: 6688, 2023: 5387 }; // "Depreciation, amortisation and impairment", cash-flow statement
  for (const y of YEARS) {
    const da = val("astrazeneca", y, "depreciation_ppe") + val("astrazeneca", y, "depreciation_rou") + val("astrazeneca", y, "amortisation_intangibles");
    // The difference is impairment. It is large in 2024 (about 24% of the line), so it is reported for review rather than judged by a threshold.
    add("identity", `astrazeneca ${y}: D&A excl. impairment (${da}) is below the cash-flow "D&A and impairment" line (${cf[y]})`, da < cf[y], `implied impairment ${cf[y] - da} (${(((cf[y] - da) / cf[y]) * 100).toFixed(0)}% of the line); confirm against the notes`);
  }
}

// 3. FX sanity.
for (const y of YEARS) {
  const r = ds.fx.usdPerGbpAvg[y];
  const e = ds.fx.usdPerGbpEnd[y];
  add("fx", `USD per GBP ${y} within a plausible band`, r > 1.1 && r < 1.5 && e > 1.1 && e < 1.5, `average ${r.toFixed(4)}, year-end ${e.toFixed(4)}`);
}

// 4. Completeness.
add("completeness", "no missing required metrics", ds.issues.length === 0, ds.issues.length ? ds.issues.join("; ") : "all required tags found for 3 companies x 3 years");

// 5. Restatement report (informational, never a failure).
const restated = [];
for (const [c, co] of Object.entries(ds.companies)) {
  for (const y of YEARS) {
    for (const [m, v] of Object.entries(co.years[y])) {
      if (v.restated && v.versions) restated.push({ company: c, year: y, metric: m, latest: v.value, earlier: v.versions.filter((x) => x.value !== v.value).map((x) => x.value) });
    }
  }
}

const hard = checks.filter((c) => !c.pass);
const summary = {
  generated: new Date().toISOString().slice(0, 10),
  totals: { checks: checks.length, passed: checks.length - hard.length, failed: hard.length, reconciledFigures: recTotal, reconciliationMismatches: recMiss },
  byGroup: Object.fromEntries([...new Set(checks.map((c) => c.group))].map((g) => [g, { passed: checks.filter((c) => c.group === g && c.pass).length, total: checks.filter((c) => c.group === g).length }])),
  failures: hard,
  restatements: restated,
  notReconciled: rec.notReconciled,
  scope: "Covers 3 companies x 3 fiscal years. Reconciliation compares the dataset with figures read from the SEC's rendered statements; it is a consistency check, not an audit.",
};
fs.writeFileSync(path.join(root, "src/data/pharma/validation.json"), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ totals: summary.totals, byGroup: summary.byGroup }, null, 1));
if (hard.length) {
  console.log("FAILURES:");
  hard.forEach((h) => console.log(`  - [${h.group}] ${h.name}: ${h.detail}`));
  process.exit(1);
}
console.log(`restated figures noted: ${restated.length}`);
restated.slice(0, 12).forEach((r) => console.log(`  ${r.company} ${r.year} ${r.metric}: now ${r.latest}, earlier ${r.earlier.join(" / ")}`));
