// Writes the downloadable inputs of the credit screen: a long-format CSV with the source of every figure, plus the extra-data and validation JSON.
// Run: node tools/credit/export-downloads.mjs
import fs from "node:fs";

const ma = JSON.parse(fs.readFileSync("src/data/ma/dataset.json", "utf8"));
const extra = JSON.parse(fs.readFileSync("src/data/credit/extra.json", "utf8"));
const OUT = "public/downloads/credit-risk-screen";
fs.mkdirSync(OUT, { recursive: true });

const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const lines = ["ticker,name,fiscal_year,metric,value_usd_millions,xbrl_tag,accession,filed,period_end,note"];
const CORE = ["revenue", "operating_income", "da", "cfo", "cash", "st_investments", "debt", "assets"];
for (const [t, c] of Object.entries(ma.companies)) {
  for (const y of [2022, 2023, 2024, 2025]) {
    const core = c.years[y] ?? {};
    const ex = extra.companies[t]?.years[y] ?? {};
    for (const [group, metrics] of [[core, CORE], [ex, Object.keys(ex)]]) {
      for (const m of metrics) {
        const cell = group[m];
        if (!cell) continue;
        lines.push([t, q(c.name), y, m, cell.value, q(cell.tag), q(cell.accn), cell.filed, cell.end, q(cell.note ?? "")].join(","));
      }
    }
  }
  for (const d of c.debtLikeItems ?? []) lines.push([t, q(c.name), 2025, "debt_like_item", d.value, q("10-K text"), "", "", "", q(d.label)].join(","));
}
fs.writeFileSync(`${OUT}/credit-inputs.csv`, lines.join("\n") + "\n");
fs.copyFileSync("src/data/credit/extra.json", `${OUT}/credit-extra.json`);
fs.copyFileSync("src/data/credit/validation.json", `${OUT}/credit-validation.json`);
console.log("rows", lines.length - 1);
