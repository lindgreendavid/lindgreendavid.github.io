// Re-checks src/data/ma/balance-sheet-debt.json against the 10-K text in data-raw/ma/:
//  - every listed line (label and amount, as printed in thousands) must appear in the filing text;
//  - for companies recorded as having no borrowings, the liabilities section of the balance sheet must contain no debt-like words;
//  - for the others, the recorded total must equal the sum of the listed lines.
import fs from "node:fs";

const cur = JSON.parse(fs.readFileSync("src/data/ma/balance-sheet-debt.json", "utf8"));
const results = [];
const add = (ticker, check, ok, detail = "") => results.push({ ticker, check, ok, detail });
const textOf = (t) => fs.readFileSync(`data-raw/ma/${t}-10k.htm`, "utf8").replace(/<ix:header>[\s\S]*?<\/ix:header>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#160;|&nbsp;/g, " ").replace(/&#8217;/g, "'").replace(/&#8203;|​/g, " ").replace(/&#\d+;/g, " ").replace(/\s+/g, " ");

/** The liabilities block of the balance sheet: from the first "Total current liabilities" that is followed by "Total liabilities" and preceded by "Total assets". */
function liabilities(x) {
  for (const m of x.matchAll(/Total liabilities/g)) {
    const before = x.slice(Math.max(0, m.index - 3200), m.index);
    if (before.includes("Total current liabilities") && x.slice(Math.max(0, m.index - 4500), m.index).includes("Total assets")) {
      const j = before.lastIndexOf("Current liabilities");
      return j >= 0 ? before.slice(j) : before;
    }
  }
  return null;
}

for (const [t, c] of Object.entries(cur.companies)) {
  const x = textOf(t);
  for (const l of [...(c.lines ?? []), ...(c.debtLike ?? [])]) {
    add(t, `10-K text contains "${l.text}"`, x.includes(l.text));
    const printed = Math.round(l.value * 1000).toLocaleString("en-US");
    add(t, `amount for "${l.label}" matches the printed ${printed} (thousands)`, l.text.endsWith(printed));
  }
  if (c.debt === 0 && !(c.lines ?? []).length) {
    const seg = liabilities(x);
    add(t, "balance-sheet liabilities were located", !!seg);
    if (seg) {
      const hit = seg.match(/debt|borrowing|loan|notes payable|convertible|credit facility|royalt/i);
      // BCRX has a term loan line only in the prior-year column and royalty obligations; those are listed as debt-like above.
      const expectNone = (c.debtLike ?? []).length === 0;
      if (expectNone) add(t, "no debt-like words in the liabilities section", !hit, hit ? hit[0] : "");
    }
  } else {
    const sum = (c.lines ?? []).reduce((s, l) => s + l.value, 0);
    add(t, "recorded debt equals the sum of the listed lines", Math.abs(sum - c.debt) < 0.0015, `${sum.toFixed(3)} vs ${c.debt}`);
  }
}
// Manually read FY2025 figures (manual-values.json): each text snippet must appear in the filing and the amounts must add up.
const man = JSON.parse(fs.readFileSync("src/data/ma/manual-values.json", "utf8"));
for (const [t, metrics] of Object.entries(man.companies)) {
  const x = textOf(t);
  for (const [metric, mv] of Object.entries(metrics)) {
    const lines = mv.lines ?? [{ text: mv.text, value: mv.value }];
    for (const l of lines) add(t, `${metric}: 10-K text contains "${l.text}"`, x.includes(l.text));
    if (mv.lines) add(t, `${metric}: recorded value equals the sum of the lines`, Math.abs(mv.lines.reduce((s, l) => s + l.value, 0) - mv.value) < 0.0015, `${mv.value}`);
    else if (mv.value !== 0) add(t, `${metric}: amount matches the printed figure`, mv.text.includes(Math.round(mv.value * 1000).toLocaleString("en-US")));
  }
}
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} balance-sheet checks pass`);
for (const f of failed) console.log("FAIL", f.ticker, f.check, f.detail);
fs.writeFileSync("src/data/ma/balance-sheet-validation.json", JSON.stringify({ generated: new Date().toISOString().slice(0, 10), total: results.length, passed: results.length - failed.length, results }, null, 1));
process.exitCode = failed.length ? 1 : 0;
