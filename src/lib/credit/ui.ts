// Rendering and interaction for the Credit Risk Screen. The render functions return HTML strings, so the first view is produced on the server
// and the same code re-renders in the browser when someone changes a limit. Nothing the visitor enters leaves the page.
import { BUCKETS, FACTORS, FACTOR_INFO, headroom, rankRows, rowFor } from "./model.ts";
import { lineChart } from "../lineChart.ts";
import type { BucketName, Compact, Options, Robustness, Row, Validity } from "./model.ts";
import { fmtM, fmtPct, fmtX } from "../pharma/ui.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const display = (name: string) => {
  const t = name.replace(/,?\s+(Inc|Corp|Corporation|plc|Ltd)\.?$/i, "").replace(/\s+Holdings$/i, "").replace(/\s+(Pharmaceuticals|Pharma|Therapeutics)$/i, "");
  return t.split(/\s+/).map((w, k) => (k === 0 && w.length <= 3 ? w.toUpperCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");
};
const num = (x: number | string | null, f: (n: number) => string) => (x === null ? "n/a" : typeof x === "number" ? f(x) : x);
const BUCKET_CLASS: Record<BucketName, string> = { "Low strain": "b-strong", "Moderate strain": "b-ok", "Elevated strain": "b-weak", "High strain": "b-vuln" };
const chip = (b: BucketName | null) => (b ? `<span class="chip-b ${BUCKET_CLASS[b]}">${b}</span>` : "n/a");

/** Score today (filled dot) and after the shock (hollow dot) on a 0 to 100 track banded by bucket. */
export function scoreRange(rows: Row[], shock: number): string {
  const zone = (from: number, to: number, cls: string) => `<span class="dl-zone ${cls}" style="left:${from}%;width:${to - from}%"></span>`;
  const zones = zone(0, 35, "z-vuln") + zone(35, 55, "z-weak") + zone(55, 75, "z-ok") + zone(75, 100, "z-strong");
  const li = rows
    .filter((r) => r.score !== null && r.stressedScore !== null)
    .map((r) => {
      const a = r.score as number;
      const b = r.stressedScore as number;
      return `<li><span class="dl-label">${esc(r.ticker)}</span><span class="dl-track" aria-hidden="true">${zones}<span class="dl-seg" style="left:${Math.min(a, b)}%;width:${Math.abs(a - b)}%"></span><span class="dl-dot dl-str" style="left:${b}%"></span><span class="dl-dot dl-now" style="left:${a}%"></span></span><span class="dl-val">${a.toFixed(0)} → ${b.toFixed(0)}</span></li>`;
    })
    .join("");
  return `<figure class="dl"><figcaption class="sr">Credit score today and after a ${(shock * 100).toFixed(0)}% fall in EBITDA, by company, on a scale of 0 to 100</figcaption><div class="dl-axis" aria-hidden="true"><span class="dl-label"></span><span class="dl-scale"><span style="left:17.5%">High</span><span style="left:45%">Elevated</span><span style="left:65%">Moderate</span><span style="left:87.5%">Low</span></span><span class="dl-val"></span></div><ul>${li}</ul></figure>`;
}

/** Tightest first: the fall in EBITDA each company can absorb before it breaches the leverage limit or the cover floor. */
export function headroomList(rows: Row[]): string {
  const items = rows.filter((r) => r.headroom !== null).sort((a, b) => (a.headroom!.value - b.headroom!.value) || a.ticker.localeCompare(b.ticker));
  const li = items
    .map((r) => {
      const h = r.headroom!;
      const text = h.binding === "already" ? "breached" : h.binding === "none" ? "no limit applies" : `${(h.value * 100).toFixed(0)}%`;
      return `<li><span class="mb-label">${esc(r.ticker)}</span><span class="mb-track" aria-hidden="true"><span class="mb-fill" style="--w:${(h.value * 100).toFixed(1)}%"></span></span><span class="mb-val mb-wide">${text}</span></li>`;
    })
    .join("");
  const missing = rows.filter((r) => r.headroom === null).map((r) => r.ticker);
  return `<figure class="mb mb-w"><figcaption class="sr">EBITDA fall each company can absorb before breaching the limits</figcaption><ul>${li}</ul>${missing.length ? `<p class="mb-note">Not computed (a needed figure is missing): ${esc(missing.join(", "))}.</p>` : ""}</figure>`;
}

export function rankTable(rows: Row[], opts: Options): string {
  const body = rows
    .map((r, i) => {
      const z = r.altman ? `${r.altman.z.toFixed(1)} (${r.altman.zone})` : "n/a";
      const flags = r.flags.length ? `<details class="flags"><summary>${r.flags.length} flag${r.flags.length > 1 ? "s" : ""}</summary><ul>${r.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : "None";
      const h = r.headroom ? (r.headroom.binding === "already" ? "breached" : r.headroom.binding === "none" ? "none" : fmtPct(r.headroom.value, 0)) : "n/a";
      return `<tr><td class="num">${i + 1}</td><th scope="row">${esc(display(r.name))} <span class="tick">${esc(r.ticker)}</span></th><td class="num strong">${r.score === null ? "n/a" : r.score.toFixed(0)}</td><td>${chip(r.bucket)}</td><td class="num">${num(r.ratios.leverage, fmtX)}</td><td class="num">${num(r.ratios.coverage, fmtX)}</td><td class="num">${num(r.ratios.fcfToDebt, (n) => fmtPct(n, 0))}</td><td class="num">${num(r.ratios.liquidity, (n) => fmtPct(n, 0))}</td><td class="num">${h}</td><td>${chip(r.stressedBucket)}</td><td class="num">${z}</td><td>${flags}</td></tr>`;
    })
    .join("");
  return `<table class="tbl rank"><caption class="sr">Credit screen, ranked by score</caption><thead><tr><th scope="col">Rank</th><th scope="col">Company</th><th scope="col">Score</th><th scope="col">Band</th><th scope="col">Net debt / EBITDA</th><th scope="col">Interest cover</th><th scope="col">Cash flow / debt</th><th scope="col">Liquidity</th><th scope="col">EBITDA fall to a limit (${opts.leverageLimit}x, ${opts.coverageFloor}x)</th><th scope="col">Band after ${(opts.shock * 100).toFixed(0)}% fall</th><th scope="col">Altman Z″</th><th scope="col">Data flags</th></tr></thead><tbody>${body}</tbody></table>`;
}

/** Where the debt-based screen and the Altman score disagree: the most useful single thing to look at. */
export function disagreements(rows: Row[]): string {
  const hi = rows.filter((r) => (r.bucket === "Low strain" || r.bucket === "Moderate strain") && r.altman?.zone === "distress");
  const lo = rows.filter((r) => (r.bucket === "Elevated strain" || r.bucket === "High strain") && r.altman?.zone === "safe");
  const li = (r: Row) => `<li><strong>${esc(display(r.name))} (${esc(r.ticker)})</strong><span>Screen: ${r.bucket} (${(r.score as number).toFixed(0)}). Altman Z″: ${r.altman!.z.toFixed(1)}, ${r.altman!.zone}.</span></li>`;
  return `<div class="uses"><div class="uses-col"><h3>Screen shows low or moderate strain, Altman says distress</h3>${hi.length ? `<ul class="uses-list">${hi.map(li).join("")}</ul>` : '<p class="muted">None under the current settings.</p>'}</div><div class="uses-col"><h3>Screen shows elevated or high strain, Altman says safe</h3>${lo.length ? `<ul class="uses-list">${lo.map(li).join("")}</ul>` : '<p class="muted">None under the current settings.</p>'}</div></div>`;
}

export function drill(k: Compact, opts: Options): string {
  const yrs = Object.keys(k.years).sort();
  const rs = yrs.map((y) => ({ y, r: rowFor(k, Number(y), opts) }));
  const cell = (f: (r: Row) => string) => rs.map(({ r }) => `<td class="num">${f(r)}</td>`).join("");
  const m = (n: number | null) => (n === null ? "n/a" : fmtM(n));
  const last = rs[rs.length - 1].r;
  return `<table class="tbl"><caption class="sr">${esc(display(k.name))}, four years of the credit ratios</caption><thead><tr><th scope="col">$m</th>${yrs.map((y) => `<th scope="col">FY${y}</th>`).join("")}</tr></thead><tbody>
    <tr><th scope="row">Revenue</th>${cell((r) => m(r.raw.revenue))}</tr>
    <tr><th scope="row">EBITDA</th>${cell((r) => m(r.raw.ebitda))}</tr>
    <tr><th scope="row">EBITDA margin</th>${cell((r) => num(r.ratios.margin, (n) => fmtPct(n, 0)))}</tr>
    <tr><th scope="row">Debt</th>${cell((r) => m(r.raw.debt))}</tr>
    <tr><th scope="row">Cash and short-term investments</th>${cell((r) => m(r.raw.cash))}</tr>
    <tr><th scope="row">Interest expense</th>${cell((r) => m(r.raw.interest))}</tr>
    <tr><th scope="row">Free cash flow (operating cash flow less capex)</th>${cell((r) => m(r.ratios.fcf))}</tr>
    <tr class="sum"><th scope="row">Net debt / EBITDA</th>${cell((r) => num(r.ratios.leverage, fmtX))}</tr>
    <tr class="sum"><th scope="row">Interest cover</th>${cell((r) => num(r.ratios.coverage, fmtX))}</tr>
    <tr class="sum"><th scope="row">Score and band</th>${cell((r) => (r.score === null ? "n/a" : `${r.score.toFixed(0)} · ${r.bucket}`))}</tr>
  </tbody></table>
  <h4 class="sub-h" style="margin-top:1.25rem;font-size:1.05rem">Score by factor, latest year</h4>
  <table class="tbl"><caption class="sr">Factor scores for the latest year</caption><thead><tr><th scope="col">Factor</th><th scope="col">Measure</th><th scope="col">Score</th><th scope="col">Weight</th></tr></thead><tbody>${FACTORS.map((f) => `<tr><th scope="row">${FACTOR_INFO[f].label}</th><td>${FACTOR_INFO[f].measure}</td><td class="num">${last.scores[f] === null ? "missing" : (last.scores[f] as number).toFixed(0)}</td><td class="num">${FACTOR_INFO[f].weight}</td></tr>`).join("")}</tbody></table>
  ${last.flags.length ? `<details class="flags" style="margin-top:0.75rem"><summary>${last.flags.length} flag${last.flags.length > 1 ? "s" : ""} for this company</summary><ul>${last.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : ""}
  <p class="muted" style="margin-top:0.75rem">Earlier years use the same definitions. Sold-royalty obligations are included only for FY2025, the only year they were read from the filing.</p>`;
}


/** Companies whose band is not stable under random re-weighting, and the exploratory validity checks. Built once, from the default settings. */
export function renderRobustness(rb: Robustness, rows: Row[], validity: Validity[]): { stable: number; total: number; unstable: string; validity: string } {
  const by = Object.fromEntries(rows.map((r) => [r.ticker, r]));
  const entries = Object.entries(rb.perTicker);
  const unstable = entries.filter(([, x]) => x.sameBand < 0.9).sort((a, b) => a[1].rank - b[1].rank);
  const table = unstable.length
    ? `<table class="tbl"><caption class="sr">Companies whose band changes in more than 10% of the random re-weightings</caption><thead><tr><th scope="col">Company</th><th scope="col">Base band</th><th scope="col">Base rank</th><th scope="col">Rank range (5th to 95th percentile)</th><th scope="col">Share of re-weightings in the same band</th></tr></thead><tbody>${unstable
        .map(([t, x]) => `<tr><th scope="row">${esc(display(by[t].name))} <span class="tick">${esc(t)}</span></th><td>${chip(by[t].bucket)}</td><td class="num">${x.rank}</td><td class="num">${x.rankLo.toFixed(0)} to ${x.rankHi.toFixed(0)}</td><td class="num">${(x.sameBand * 100).toFixed(0)}%</td></tr>`)
        .join("")}</tbody></table>`
    : '<p class="muted">Every company keeps its band in at least 90% of the re-weightings.</p>';
  const v = `<table class="tbl"><caption class="sr">Exploratory checks on how the score behaves</caption><thead><tr><th scope="col">Check</th><th scope="col">Companies</th><th scope="col">Spearman ρ</th><th scope="col">Permutation p</th></tr></thead><tbody>${validity
    .map((x) => `<tr><th scope="row">${esc(x.label)}<br /><span class="muted">${esc(x.note)}</span></th><td class="num">${x.n}</td><td class="num">${x.rho === null ? "n/a" : x.rho.toFixed(2)}</td><td class="num">${x.p === null ? "n/a" : x.p.toFixed(3)}</td></tr>`)
    .join("")}</tbody></table>`;
  return { stable: entries.filter(([, x]) => x.sameBand >= 0.9).length, total: entries.length, unstable: table, validity: v };
}

export function renderAll(ks: Compact[], opts: Options) {
  const rows = rankRows(ks.map((k) => rowFor(k, 2025, opts)));
  return { rows, lines: breachLines(ks, opts), range: scoreRange(rows, opts.shock), headroom: headroomList(rows), table: rankTable(rows, opts), disagree: disagreements(rows), counts: bucketCounts(rows) };
}

/** How many companies would breach a limit as earnings fall, split by which limit it is: leverage, interest cover, or either. */
export function breachLines(ks: Compact[], o: Options): string {
  const rows = ks.map((k) => rowFor(k, 2025, o)).filter((r) => r.headroom !== null);
  const falls = Array.from({ length: 17 }, (_, k) => k * 0.05);
  const count = (s: number, lev: number, cov: number) =>
    rows.reduce((n, r) => {
      const h = headroom(r.raw, lev, cov);
      return n + (h && (h.binding === "already" || (h.binding !== "none" && h.value < s)) ? 1 : 0);
    }, 0);
  const NO_LEV = 1e9; // a limit nobody can reach, so only the other test counts
  const either = (s: number) => count(s, o.leverageLimit, o.coverageFloor);
  const levOnly = (s: number) => count(s, o.leverageLimit, 0);
  const covOnly = (s: number) => count(s, NO_LEV, o.coverageFloor);
  const now = either(o.shock);
  const today = either(0);
  const pct = `${(o.shock * 100).toFixed(0)}%`;
  const svg = lineChart({
    lines: [
      { label: "Leverage", points: falls.map((s): [number, number | null] => [s, levOnly(s)]) },
      { label: "Cover", points: falls.map((s): [number, number | null] => [s, covOnly(s)]) },
      { label: "Either", emphasis: true, points: falls.map((s): [number, number | null] => [s, either(s)]) },
    ],
    xFmt: (x) => `${(x * 100).toFixed(0)}%`,
    yFmt: (y) => `${y.toFixed(0)}`,
    xTitle: "Fall in EBITDA",
    yTitle: `Companies in breach (of ${rows.length})`,
    xTicks: [0, 0.2, 0.4, 0.6, 0.8],
    yMin: 0,
    yMax: rows.length,
    marker: { x: o.shock, y: now, label: `${now} of ${rows.length} at a ${pct} fall` },
    label: `Number of companies in breach as EBITDA falls, split into the leverage limit of ${o.leverageLimit} times and the interest-cover floor of ${o.coverageFloor} times. At a ${pct} fall, ${now} of ${rows.length} companies are in breach of either.`,
  });
  const read = `<p class="lc-read">${today} of ${rows.length} companies are already over a limit before any fall. At a ${pct} fall that becomes ${now}: ${levOnly(o.shock)} on leverage and ${covOnly(o.shock)} on interest cover (some are on both). Leverage means net debt over EBITDA above ${o.leverageLimit}x; cover means EBITDA over interest below ${o.coverageFloor}x.</p>`;
  return svg + read;
}

export function bucketCounts(rows: Row[]): string {
  const n = (b: BucketName) => rows.filter((r) => r.bucket === b).length;
  const s = (b: BucketName) => rows.filter((r) => r.stressedBucket === b).length;
  const body = BUCKETS.map((b) => `<tr><th scope="row">${chip(b.name)}</th><td class="num">${n(b.name)}</td><td class="num">${s(b.name)}</td></tr>`).join("");
  return `<table class="tbl"><caption class="sr">Number of companies in each band, today and after the shock</caption><thead><tr><th scope="col">Band</th><th scope="col">Today</th><th scope="col">After the fall</th></tr></thead><tbody>${body}</tbody></table>`;
}

type Field = "lev" | "cov" | "shock";
export function readOptions(form: HTMLFormElement): Options | string {
  const n = (f: Field) => parseFloat((form.elements.namedItem(f) as HTMLInputElement).value);
  const lev = n("lev");
  const cov = n("cov");
  const shock = n("shock") / 100;
  if (![lev, cov, shock].every(Number.isFinite)) return "Every setting needs a number.";
  if (lev <= 0 || lev > 20) return "The leverage limit must be between 0 and 20 times EBITDA.";
  if (cov <= 0 || cov > 50) return "The interest-cover floor must be between 0 and 50 times.";
  if (shock < 0 || shock > 0.9) return "The EBITDA fall must be between 0% and 90%.";
  return { includeRoyalty: (form.elements.namedItem("royalty") as HTMLInputElement).checked, leverageLimit: lev, coverageFloor: cov, shock };
}

export function initCredit(ks: Compact[]) {
  const form = document.getElementById("credit-form") as HTMLFormElement | null;
  if (!form) return;
  const out = (id: string) => document.getElementById(id)!;
  const sel = document.getElementById("drill-company") as HTMLSelectElement;
  const render = () => {
    const o = readOptions(form);
    const err = out("credit-error");
    if (typeof o === "string") {
      err.textContent = o;
      err.hidden = false;
      return;
    }
    err.hidden = true;
    const x = renderAll(ks, o);
    out("credit-range").innerHTML = x.range;
    out("credit-lines").innerHTML = x.lines;
    out("credit-headroom").innerHTML = x.headroom;
    out("credit-table").innerHTML = x.table;
    out("credit-disagree").innerHTML = x.disagree;
    out("credit-counts").innerHTML = x.counts;
    const k = ks.find((c) => c.ticker === sel.value);
    if (k) out("credit-drill").innerHTML = drill(k, o);
    out("shock-label").textContent = `${(o.shock * 100).toFixed(0)}%`;
  };
  let t: number | undefined;
  const later = () => {
    window.clearTimeout(t);
    t = window.setTimeout(render, 120);
  };
  form.addEventListener("input", later);
  sel.addEventListener("change", render);
  document.getElementById("credit-reset")?.addEventListener("click", () => {
    (form.elements.namedItem("lev") as HTMLInputElement).value = "4";
    (form.elements.namedItem("cov") as HTMLInputElement).value = "3";
    (form.elements.namedItem("shock") as HTMLInputElement).value = "30";
    (form.elements.namedItem("royalty") as HTMLInputElement).checked = true;
    render();
  });
}
