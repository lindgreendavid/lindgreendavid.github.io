// Builds src/data/pharma/dataset.json from the raw SEC company-facts files and ECB exchange rates.
// Rules (see companies.mjs): every number carries the XBRL tag(s), the SEC accession it came from and the filing date.
// When the same period appears in several filings, the LATEST filing wins (it reflects restatements) and the earlier
// values are kept as `versions` so a reader can see what changed.
import fs from "node:fs";
import path from "node:path";
import { COMPANIES, YEARS } from "./companies.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const raw = (id) => JSON.parse(fs.readFileSync(path.join(root, `data/pharma/raw/raw-${id}.json`), "utf8"));
const days = (a, b) => (new Date(b) - new Date(a)) / 86400000;

function candidates(facts, tag, year, instant) {
  const [tax, name] = tag.includes(":") ? tag.split(":") : ["ifrs-full", tag];
  const f = facts.facts[tax]?.[name];
  if (!f) return [];
  const end = `${year}-12-31`;
  const rows = [];
  for (const unit of Object.keys(f.units)) {
    for (const x of f.units[unit]) {
      if (!/^20-F/.test(x.form) || x.end !== end) continue;
      if (instant ? x.start !== undefined : x.start === undefined || Math.abs(days(x.start, x.end) - 365) > 10) continue;
      rows.push({ ...x, unit });
    }
  }
  return rows;
}

function resolve(facts, tag, year, rule) {
  const rows = candidates(facts, tag, year, !!rule.instant);
  if (!rows.length) return null;
  rows.sort((a, b) => (a.filed < b.filed ? -1 : 1));
  const latest = rows[rows.length - 1];
  const versions = [...new Map(rows.map((r) => [`${r.val}|${r.accn}`, r])).values()].map((r) => ({ value: r.val / (rule.scale ?? 1e6), accn: r.accn, filed: r.filed }));
  const distinct = new Set(rows.map((r) => r.val));
  return {
    value: latest.val / (rule.scale ?? 1e6),
    unit: latest.unit,
    tag,
    accn: latest.accn,
    filed: latest.filed,
    form: latest.form,
    restated: distinct.size > 1,
    versions: distinct.size > 1 ? versions : undefined,
  };
}

const dataset = { generated: new Date().toISOString().slice(0, 10), units: "millions of reporting currency unless stated", companies: {}, fx: {}, issues: [] };

for (const [id, c] of Object.entries(COMPANIES)) {
  const facts = raw(id);
  const out = { name: c.name, entity: facts.entityName, cik: c.cik, currency: c.currency, standard: c.standard, form: c.form, fiscalYearEnd: c.fiscalYearEnd, notes: c.notes, ...(c.reference ? { reference: c.reference } : {}), years: {} };
  for (const year of YEARS) {
    const y = {};
    for (const [metric, rule] of Object.entries(c.rules)) {
      let res;
      if (rule.sum) {
        const parts = rule.sum.map((t) => resolve(facts, t, year, rule));
        if (parts.some((p) => !p)) res = null;
        else {
          res = {
            value: parts.reduce((s, p) => s + p.value, 0),
            unit: parts[0].unit,
            tag: rule.sum.join(" + "),
            accn: [...new Set(parts.map((p) => p.accn))].join(", "),
            filed: parts.map((p) => p.filed).sort().pop(),
            form: parts[0].form,
            restated: parts.some((p) => p.restated),
            components: parts.map((p) => ({ tag: p.tag, value: p.value })),
          };
        }
      } else {
        res = resolve(facts, rule.tag, year, rule);
      }
      if (!res) {
        if (!rule.optional) dataset.issues.push(`${id} ${year}: missing ${metric} (${rule.tag ?? rule.sum.join("+")})`);
        continue;
      }
      y[metric] = res;
    }
    for (const [metric, fn] of Object.entries(c.derived ?? {})) {
      try {
        const vals = Object.fromEntries(Object.entries(y).map(([k, v]) => [k, v.value]));
        y[metric] = { value: fn(vals), unit: c.currency, tag: "derived", derived: true };
      } catch (e) {
        dataset.issues.push(`${id} ${year}: could not derive ${metric}: ${e.message}`);
      }
    }
    out.years[year] = y;
  }
  dataset.companies[id] = out;
}

// AstraZeneca share count. The FY2025 20-F cover page (text, not an XBRL value) gives 1,550,907,927 ordinary shares outstanding.
// Earlier years, and a cross-check, use issued capital / $0.25 nominal value (issued capital includes any treasury shares).
{
  const az = dataset.companies.astrazeneca;
  const facts = raw("astrazeneca");
  for (const year of YEARS) {
    const r = resolve(facts, "IssuedCapital", year, { instant: true });
    if (r) {
      az.years[year].shares_outstanding_m = { value: r.value / 0.25, unit: "shares (m)", tag: "IssuedCapital / 0.25 nominal", accn: r.accn, filed: r.filed, form: r.form, derived: true };
    } else dataset.issues.push(`astrazeneca ${year}: IssuedCapital not found`);
  }
  az.years[2025].shares_derived_check_m = az.years[2025].shares_outstanding_m;
  az.years[2025].shares_outstanding_m = {
    value: 1550.907927,
    unit: "shares (m)",
    tag: "20-F cover page: ordinary shares outstanding",
    accn: "0001104659-26-019130",
    filed: "2026-02-24",
    form: "20-F",
    source: "https://www.sec.gov/Archives/edgar/data/901832/000110465926019130/R1.htm",
  };
}

// ECB reference rates (units of currency per 1 EUR). Annual average for flows, end-of-period for balances.
async function ecb(series) {
  const url = `https://data-api.ecb.europa.eu/service/data/EXR/${series}?format=csvdata&detail=dataonly&startPeriod=2023&endPeriod=2025`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ECB ${series}: ${res.status}`);
  const [head, ...lines] = (await res.text()).trim().split(/\r?\n/);
  const cols = head.split(",");
  const ti = cols.indexOf("TIME_PERIOD");
  const vi = cols.indexOf("OBS_VALUE");
  return Object.fromEntries(lines.map((l) => l.split(",")).map((r) => [r[ti], Number(r[vi])]));
}
const fx = {
  source: "European Central Bank euro foreign exchange reference rates (data-api.ecb.europa.eu, dataset EXR)",
  retrieved: new Date().toISOString().slice(0, 10),
  usdPerEurAvg: await ecb("A.USD.EUR.SP00.A"),
  usdPerEurEnd: await ecb("A.USD.EUR.SP00.E"),
  gbpPerEurAvg: await ecb("A.GBP.EUR.SP00.A"),
  gbpPerEurEnd: await ecb("A.GBP.EUR.SP00.E"),
};
fx.usdPerGbpAvg = Object.fromEntries(YEARS.map((y) => [y, fx.usdPerEurAvg[y] / fx.gbpPerEurAvg[y]]));
fx.usdPerGbpEnd = Object.fromEntries(YEARS.map((y) => [y, fx.usdPerEurEnd[y] / fx.gbpPerEurEnd[y]]));
fx.method = "USD per GBP = (USD per EUR) / (GBP per EUR). Income-statement and cash-flow items use the annual average; balance-sheet items use the year-end rate.";
dataset.fx = fx;

const file = path.join(root, "src/data/pharma/dataset.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(dataset, null, 1));
console.log(`wrote ${file}`);
console.log(`issues: ${dataset.issues.length}`);
dataset.issues.forEach((i) => console.log("  - " + i));

// Compact preview for a human check.
for (const [id, c] of Object.entries(dataset.companies)) {
  console.log(`\n${c.name} (${c.currency}, millions)`);
  const metrics = Object.keys(c.years[2025] ?? {});
  for (const m of metrics) {
    console.log(`  ${m.padEnd(26)} ${YEARS.map((y) => String(Math.round((c.years[y]?.[m]?.value ?? NaN) * 10) / 10).padStart(12)).join("")}${YEARS.some((y) => c.years[y]?.[m]?.restated) ? "   (restated)" : ""}`);
  }
}
