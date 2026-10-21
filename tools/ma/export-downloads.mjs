// Writes the downloadable files for the M&A screening page into public/downloads/ma-screening/.
import fs from "node:fs";

const ds = JSON.parse(fs.readFileSync("src/data/ma/dataset.json", "utf8"));
const dir = "public/downloads/ma-screening";
fs.mkdirSync(dir, { recursive: true });
const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const lines = ["ticker,company,sic,metric,fiscal_year,value_usd_millions,xbrl_tag,accession,filed,period_end,note"];
for (const c of Object.values(ds.companies)) {
  for (const [y, rows] of Object.entries(c.years)) {
    for (const [metric, cell] of Object.entries(rows)) {
      lines.push([c.ticker, q(c.name), c.sic, metric, y, cell ? cell.value : "", cell ? q(cell.tag) : "", cell?.accn ?? "", cell?.filed ?? "", cell?.end ?? "", q(cell?.note ?? (cell ? "" : "not found in XBRL data"))].join(","));
    }
  }
}
fs.writeFileSync(`${dir}/ma-dataset.csv`, lines.join("\n") + "\n");
fs.copyFileSync("src/data/ma/dataset.json", `${dir}/ma-dataset.json`);
fs.copyFileSync("src/data/ma/validation.json", `${dir}/ma-validation.json`);
console.log("wrote", lines.length - 1, "rows");
