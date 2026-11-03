// Rendering and interaction for the LBO Workbench. The render functions return HTML strings, so the first view is produced on the
// server and the same code re-renders in the browser when someone changes an assumption. Nothing the visitor enters leaves the page.
import { HOLD_YEARS, LboInputError, inputsFor, irrGrid, monteCarlo, runLbo, tornado, validateLbo } from "./model.ts";
import type { LboInputs, LboResult } from "./model.ts";
import { stacked, waterfall } from "./charts.ts";
import { heatmap, fmtM, fmtPct, fmtX } from "../pharma/ui.ts";
import { densify, mountSurface } from "../surfaceView.ts";

export type Target = { ticker: string; name: string; revenue: number; ebitda: number; da: number; netDebt: number; flags: string[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number) => `$${fmtM(n)}m`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}$${fmtM(Math.abs(n))}m`;

export function renderLbo(i: LboInputs, r: LboResult) {
  const exitYear = r.years[HOLD_YEARS - 1];
  const summary = `<table class="tbl"><caption class="sr">Returns to the sponsor</caption><tbody>
    <tr><th scope="row">Sponsor equity at close</th><td class="num">${money(r.sponsorEquity)}</td></tr>
    <tr><th scope="row">Equity value at exit, year ${HOLD_YEARS}</th><td class="num">${money(r.exitEquity)}</td></tr>
    ${r.exitEquity < 0 ? `<tr><th scope="row">Proceeds to the sponsor (cannot be below zero)</th><td class="num">${money(r.sponsorProceeds)}</td></tr>` : ""}
    <tr class="sum"><th scope="row">Money multiple (MOIC)</th><td class="num">${r.moic.toFixed(2)}x</td></tr>
    <tr class="sum"><th scope="row">${r.fundingGap ? "Annual return (IRR), conditional on unmodelled funding" : "Annual return (IRR)"}</th><td class="num">${fmtPct(r.irr)}</td></tr>
    <tr><th scope="row">Equity share of funding</th><td class="num">${fmtPct(r.equityShare, 0)}</td></tr>
    <tr><th scope="row">Net debt / EBITDA at close → at exit</th><td class="num">${fmtX((r.senior0 + r.sub0) / i.ebitda0)} → ${exitYear.leverage === null ? "n/a" : fmtX(Math.max(0, exitYear.leverage))}</td></tr>
  </tbody></table>`;

  const big = `<p class="big-line">Buy at ${fmtX(i.entryMultiple)} EBITDA, sell at ${fmtX(i.exitMultiple)}: ${money(r.sponsorEquity)} becomes ${money(r.sponsorProceeds)} in ${HOLD_YEARS} years.</p>
  <dl class="big">
    <div><dt>${r.fundingGap ? "Annual return, if the shortfall is funded" : "Annual return (IRR)"}</dt><dd>${fmtPct(r.irr)}</dd></div>
    <div><dt>Money multiple</dt><dd>${r.moic.toFixed(2)}x</dd></div>
    <div><dt>Equity cheque</dt><dd>${money(r.sponsorEquity)}</dd></div>
  </dl>`;

  const su = `<table class="tbl"><caption class="sr">Sources and uses of funds at close</caption><thead><tr><th scope="col">Sources</th><th scope="col">$m</th><th scope="col">x EBITDA</th></tr></thead><tbody>
    <tr><th scope="row">Senior debt</th><td class="num">${fmtM(r.senior0)}</td><td class="num">${fmtX(i.seniorX)}</td></tr>
    <tr><th scope="row">Subordinated debt</th><td class="num">${fmtM(r.sub0)}</td><td class="num">${fmtX(i.subX)}</td></tr>
    <tr><th scope="row">Sponsor equity</th><td class="num">${fmtM(r.sponsorEquity)}</td><td class="num">${fmtX(r.sponsorEquity / i.ebitda0)}</td></tr>
    <tr class="sum"><th scope="row">Total sources</th><td class="num">${fmtM(r.uses)}</td><td class="num">${fmtX(r.uses / i.ebitda0)}</td></tr>
  </tbody><thead><tr><th scope="col">Uses</th><th scope="col">$m</th><th scope="col">x EBITDA</th></tr></thead><tbody>
    <tr><th scope="row">Equity purchase price (enterprise value less existing net debt)</th><td class="num">${fmtM(r.equityPurchase)}</td><td class="num">${fmtX(r.equityPurchase / i.ebitda0)}</td></tr>
    <tr><th scope="row">${i.netDebt0 < 0 ? "Existing net cash (acquired with the company)" : "Refinance existing net debt"}</th><td class="num">${fmtM(i.netDebt0)}</td><td class="num">${fmtX(i.netDebt0 / i.ebitda0)}</td></tr>
    <tr><th scope="row">Fees</th><td class="num">${fmtM(r.fees)}</td><td class="num">${fmtX(r.fees / i.ebitda0)}</td></tr>
    <tr class="sum"><th scope="row">Total uses</th><td class="num">${fmtM(r.uses)}</td><td class="num">${fmtX(r.uses / i.ebitda0)}</td></tr>
  </tbody></table>`;

  const row = (label: string, f: (y: (typeof r.years)[number]) => string, first = "") => `<tr><th scope="row">${label}</th><td class="num">${first}</td>${r.years.map((y) => `<td class="num">${f(y)}</td>`).join("")}</tr>`;
  const years = `<table class="tbl"><caption class="sr">Projection and debt schedule, $m</caption><thead><tr><th scope="col">$m</th><th scope="col">Close</th>${r.years.map((y) => `<th scope="col">Year ${y.year}</th>`).join("")}</tr></thead><tbody>
    ${row("Revenue", (y) => fmtM(y.revenue), fmtM(i.revenue0))}
    ${row("EBITDA", (y) => fmtM(y.ebitda), fmtM(i.ebitda0))}
    ${row("EBITDA margin", (y) => fmtPct(y.margin), fmtPct(i.ebitda0 / i.revenue0))}
    ${row("Cash interest", (y) => fmtM(y.interest))}
    ${row("Cash tax", (y) => fmtM(y.tax))}
    ${row("Capex", (y) => fmtM(y.capex))}
    ${row("Working-capital investment", (y) => fmtM(y.nwc))}
    <tr class="sum"><th scope="row">Free cash flow before debt repayment</th><td class="num"></td>${r.years.map((y) => `<td class="num">${fmtM(y.fcf)}</td>`).join("")}</tr>
    ${row("Mandatory repayment", (y) => fmtM(y.mandatory))}
    ${row("Cash sweep", (y) => fmtM(y.sweep))}
    ${row("Senior debt", (y) => fmtM(y.senior), fmtM(r.senior0))}
    ${row("Subordinated debt", (y) => fmtM(y.sub), fmtM(r.sub0))}
    ${row("Cash", (y) => fmtM(y.cash), "0")}
    <tr class="sum"><th scope="row">Net debt / EBITDA</th><td class="num">${fmtX((r.senior0 + r.sub0) / i.ebitda0)}</td>${r.years.map((y) => `<td class="num">${y.leverage === null ? "n/a" : fmtX(Math.max(0, y.leverage))}</td>`).join("")}</tr>
    ${row("EBITDA / cash interest", (y) => (y.coverage === null ? "n/a" : fmtX(y.coverage)))}
  </tbody></table>`;

  const b = r.bridge;
  const bridge = waterfall({
    steps: [
      { label: "Equity invested", value: r.sponsorEquity, kind: "total" },
      { label: "EBITDA growth", value: b.ebitdaGrowth, kind: "delta" },
      { label: "Multiple change", value: b.multiple, kind: "delta" },
      { label: "Debt paid down", value: b.deleveraging, kind: "delta" },
      { label: "Fees", value: b.fees, kind: "delta" },
      ...(b.limitedLiability > 0 ? [{ label: "Loss borne by lenders", value: b.limitedLiability, kind: "delta" as const }] : []),
      { label: "Equity at exit", value: r.sponsorProceeds, kind: "total" },
    ],
    format: (n) => fmtM(n),
    label: `Value creation bridge, $m: equity invested ${money(r.sponsorEquity)}, growth ${signed(b.ebitdaGrowth)}, multiple ${signed(b.multiple)}, debt paydown ${signed(b.deleveraging)}, fees ${signed(b.fees)}${b.limitedLiability > 0 ? `, loss borne by lenders ${signed(b.limitedLiability)}` : ""}, equity at exit ${money(r.sponsorProceeds)}`,
  });

  const debt = stacked({
    columns: [{ label: "Close", parts: [r.senior0, r.sub0], note: fmtX((r.senior0 + r.sub0) / i.ebitda0) }, ...r.years.map((y) => ({ label: `Year ${y.year}`, parts: [y.senior, y.sub], note: y.leverage === null ? "n/a" : fmtX(Math.max(0, y.leverage)) }))],
    partNames: ["Senior debt", "Subordinated debt"],
    format: (n) => fmtM(n),
    label: "Debt outstanding by year, $m, with net debt to EBITDA above each column",
  });

  const off = [-2, -1, 0, 1, 2];
  const rows1 = off.map((d) => i.entryMultiple + d).filter((x) => x > 0);
  const cols1 = off.map((d) => i.exitMultiple + d).filter((x) => x > 0);
  const g1 = { rows: rows1, cols: cols1, values: irrGrid(i, "entryMultiple", rows1, "exitMultiple", cols1).map((rw) => rw.map((v) => (v === null ? Number.NaN : v))) };
  const rows2 = off.map((d) => Math.max(0, i.seniorX + d * 0.75));
  const cols2 = [-0.04, -0.02, 0, 0.02, 0.04].map((d) => Math.min(0.95, Math.max(0.02, i.marginTarget + d)));
  const g2 = { rows: rows2, cols: cols2, values: irrGrid(i, "seniorX", rows2, "marginTarget", cols2).map((rw) => rw.map((v) => (v === null ? Number.NaN : v))) };
  const sens1 = heatmap(g1, { corner: "Entry \\ exit", rowFmt: (n) => fmtX(n), colFmt: (n) => fmtX(n), valFmt: (n) => fmtPct(n), current: [rows1.indexOf(i.entryMultiple), cols1.indexOf(i.exitMultiple)], caption: "IRR by entry multiple (rows) and exit multiple (columns)" });
  const sens2 = heatmap(g2, { corner: "Debt \\ margin", rowFmt: (n) => fmtX(n), colFmt: (n) => fmtPct(n), valFmt: (n) => fmtPct(n), current: [rows2.findIndex((x) => Math.abs(x - i.seniorX) < 1e-9), cols2.findIndex((x) => Math.abs(x - i.marginTarget) < 1e-9)], caption: "IRR by senior debt multiple (rows) and year-5 EBITDA margin (columns)" });
 

  const flags = r.flags.length ? `<ul class="uses-list">${r.flags.map((f) => `<li><span>${esc(f)}</span></li>`).join("")}</ul>` : `<p class="muted">No warnings for these inputs. That does not mean the deal is realistic.</p>`;
  return { big, summary, su, years, bridge, debt, sens1, sens2, flags };
}


export const MC_DRAWS = 3000;

/** IRR over a wider grid of entry and exit multiples, as data for the 3D view. A cell that cannot be run takes the lowest value. */
export function irrSurface(i: LboInputs) {
  const steps = Array.from({ length: 13 }, (_, k) => -3 + k * 0.5);
  const entry = steps.map((d) => i.entryMultiple + d).filter((x) => x > 0.5);
  const exit = steps.map((d) => i.exitMultiple + d).filter((x) => x > 0.5);
  const g = irrGrid(i, "entryMultiple", entry, "exitMultiple", exit);
  const flat = g.flat().filter((v): v is number => v !== null);
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const pct = g.map((row) => row.map((v) => (v === null ? lo : v) * 100));
  return {
    z: densify(pct, 3),
    min: lo * 100,
    max: hi * 100,
    xLabels: [`Exit ${exit[0].toFixed(1)}x`, `Exit ${exit[exit.length - 1].toFixed(1)}x`] as [string, string],
    yLabels: [`Entry ${entry[0].toFixed(1)}x`, `Entry ${entry[entry.length - 1].toFixed(1)}x`] as [string, string],
    unit: "%",
  };
}

/** Distribution of the IRR from the Monte Carlo, as a table of bins plus the headline quantiles. */
export function renderMonteCarlo(i: LboInputs): string {
  const bin = (x: number) => fmtPct(x, 0).replace("-0%", "0%");
  const m = monteCarlo(i, { draws: MC_DRAWS, seed: 1 });
  const max = Math.max(...m.hist.map((h) => h.count), 1);
  const bins = m.hist.map((h) => `<li><span class="mb-label">${bin(h.lo)} to ${bin(h.hi)}</span><span class="mb-track" aria-hidden="true"><span class="mb-fill" style="--w:${((h.count / max) * 100).toFixed(1)}%"></span></span><span class="mb-val">${((h.count / (m.fundedDraws || m.draws)) * 100).toFixed(0)}%</span></li>`).join("");
  return `<table class="tbl"><caption class="sr">Distribution of the annual return across ${m.fundedDraws || m.draws} simulated cases</caption><tbody>
    <tr><th scope="row">5th percentile</th><td class="num">${fmtPct(m.p5)}</td></tr>
    <tr><th scope="row">25th percentile</th><td class="num">${fmtPct(m.p25)}</td></tr>
    <tr class="sum"><th scope="row">Median</th><td class="num">${fmtPct(m.p50)}</td></tr>
    <tr><th scope="row">75th percentile</th><td class="num">${fmtPct(m.p75)}</td></tr>
    <tr><th scope="row">95th percentile</th><td class="num">${fmtPct(m.p95)}</td></tr>
    <tr><th scope="row">Share of cases with a loss (IRR below 0%)</th><td class="num">${fmtPct(m.probLoss, 1)}</td></tr>
    <tr><th scope="row">Share below 10% a year</th><td class="num">${fmtPct(m.probBelow10, 0)}</td></tr>
    <tr><th scope="row">Share at or above 20% a year</th><td class="num">${fmtPct(m.probAbove20, 0)}</td></tr>
    <tr><th scope="row">Simulated cases with a funding gap (left out of the figures above)</th><td class="num">${fmtPct(m.probGap, 1)}</td></tr>
  </tbody></table>
  ${m.fundedDraws === 0 ? `<p class="muted">Every simulated case had a funding gap, so the figures above include them and are conditional on financing the model does not specify.</p>` : ""}
  <figure class="mb mb-w" style="margin-top:1.25rem"><figcaption>Share of simulated cases by annual return</figcaption><ul>${bins}</ul></figure>`;
}

/** One-at-a-time sensitivity: each bar runs from the lower to the higher return when one input is moved down and up. */
export function renderTornado(i: LboInputs): string {
  const t = tornado(i);
  const vals = t.rows.flatMap((r) => [r.low, r.high]).filter((x): x is number => x !== null).concat(t.base);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pos = (x: number) => (((x - lo) / span) * 100).toFixed(1);
  const rows = t.rows
    .map((r) => {
      if (r.low === null || r.high === null) return `<li><span class="tn-label">${esc(r.driver)}</span><span class="tn-track"></span><span class="tn-val">n/a</span></li>`;
      return `<li><span class="tn-label">${esc(r.driver)}<span class="muted"> (${esc(r.lowLabel)} / ${esc(r.highLabel)})</span></span><span class="tn-track" aria-hidden="true"><span class="tn-seg" style="left:${pos(r.low)}%;width:${(((r.high - r.low) / span) * 100).toFixed(1)}%"></span><span class="tn-base" style="left:${pos(t.base)}%"></span></span><span class="tn-val">${fmtPct(r.low, 1)} to ${fmtPct(r.high, 1)}</span></li>`;
    })
    .join("");
  return `<figure class="tn"><figcaption class="sr">Annual return when each input is moved down and up, everything else unchanged</figcaption><ul>${rows}</ul><p class="mb-note">The vertical mark is the base case (${fmtPct(t.base, 1)}). Bars show the range of the annual return when that one input moves by the amount in brackets.</p></figure>`;
}

type Field = "entry" | "exit" | "senior" | "sub" | "srate" | "brate" | "amort" | "sweep" | "fee" | "g1" | "g2" | "g3" | "g4" | "g5" | "margin" | "capex" | "nwc" | "tax";
const FIELDS: Field[] = ["entry", "exit", "senior", "sub", "srate", "brate", "amort", "sweep", "fee", "g1", "g2", "g3", "g4", "g5", "margin", "capex", "nwc", "tax"];
// Multiples are entered as plain numbers; everything else as percentages.
const PLAIN: Field[] = ["entry", "exit", "senior", "sub"];

export function toFormValues(i: LboInputs): Record<Field, number> {
  return { entry: i.entryMultiple, exit: i.exitMultiple, senior: i.seniorX, sub: i.subX, srate: i.seniorRate * 100, brate: i.subRate * 100, amort: i.seniorAmortPct * 100, sweep: i.sweepPct * 100, fee: i.feePct * 100, g1: i.growth[0] * 100, g2: i.growth[1] * 100, g3: i.growth[2] * 100, g4: i.growth[3] * 100, g5: i.growth[4] * 100, margin: i.marginTarget * 100, capex: i.capexPct * 100, nwc: i.nwcPct * 100, tax: i.taxRate * 100 };
}

export function initLbo(targets: Target[]) {
  const form = document.getElementById("lbo-form") as HTMLFormElement | null;
  if (!form) return;
  const out = (id: string) => document.getElementById(id)!;
  const sel = form.elements.namedItem("target") as HTMLSelectElement;
  const get = (f: Field) => form.elements.namedItem(f) as HTMLInputElement;
  const current = () => targets.find((t) => t.ticker === sel.value) ?? targets[0];

  const setForm = () => {
    const t = current();
    const v = toFormValues(inputsFor(t));
    for (const f of FIELDS) get(f).value = String(Math.round(v[f] * 100) / 100);
    out("lbo-target").innerHTML = describe(t);
  };

  const read = (): LboInputs | string => {
    const t = current();
    const n = (f: Field) => parseFloat(get(f).value) / (PLAIN.includes(f) ? 1 : 100);
    if (FIELDS.some((f) => !Number.isFinite(n(f)))) return "Every assumption needs a number.";
    const i: LboInputs = { revenue0: t.revenue, ebitda0: t.ebitda, daPct: t.da / t.revenue, netDebt0: t.netDebt, entryMultiple: n("entry"), exitMultiple: n("exit"), seniorX: n("senior"), subX: n("sub"), seniorRate: n("srate"), subRate: n("brate"), seniorAmortPct: n("amort"), sweepPct: n("sweep"), feePct: n("fee"), growth: [n("g1"), n("g2"), n("g3"), n("g4"), n("g5")], marginTarget: n("margin"), capexPct: n("capex"), nwcPct: n("nwc"), taxRate: n("tax") };
    try {
      validateLbo(i);
    } catch (e) {
      return e instanceof LboInputError ? e.message : "These inputs cannot be run.";
    }
    return i;
  };

  const host = document.getElementById("lbo-3d");
  const view = host ? mountSurface(host) : null;
  const ids = ["lbo-big", "lbo-summary", "lbo-su", "lbo-years", "lbo-bridge", "lbo-debt", "sens1", "sens2", "lbo-flags", "lbo-mc", "lbo-tornado"];
  const renderAll = () => {
    const i = read();
    const err = out("lbo-error");
    if (typeof i === "string") {
      err.textContent = i;
      err.hidden = false;
      ids.forEach((id) => (out(id).innerHTML = ""));
      return;
    }
    err.hidden = true;
    const x = renderLbo(i, runLbo(i));
    out("lbo-big").innerHTML = x.big;
    out("lbo-summary").innerHTML = x.summary;
    out("lbo-su").innerHTML = x.su;
    out("lbo-years").innerHTML = x.years;
    out("lbo-bridge").innerHTML = x.bridge;
    out("lbo-debt").innerHTML = x.debt;
    out("sens1").innerHTML = x.sens1;
    out("sens2").innerHTML = x.sens2;
    out("lbo-flags").innerHTML = x.flags;
    out("lbo-mc").innerHTML = renderMonteCarlo(i);
    out("lbo-tornado").innerHTML = renderTornado(i);
    const sv = irrSurface(i);
    view?.set(sv, `3D surface of the sponsor IRR by entry multiple and exit multiple, from ${sv.min.toFixed(0)} to ${sv.max.toFixed(0)} percent a year.`);
  };

  let timer: number | undefined;
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(renderAll, 120);
  };
  sel.addEventListener("change", () => {
    setForm();
    renderAll();
  });
  for (const f of FIELDS) get(f).addEventListener("input", later);
  document.getElementById("lbo-reset")?.addEventListener("click", () => {
    setForm();
    renderAll();
  });
  setForm();
  renderAll();
}

export function describe(t: Target): string {
  const flags = t.flags.length ? `<details class="flags"><summary>${t.flags.length} data flag${t.flags.length > 1 ? "s" : ""} for this company</summary><ul>${t.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : "";
  return `<p class="muted">FY2025 from the company's 10-K: revenue ${money(t.revenue)}, EBITDA ${money(t.ebitda)} (operating income plus depreciation and amortisation), D&amp;A ${fmtPct(t.da / t.revenue)} of revenue, ${t.netDebt < 0 ? `net cash ${money(-t.netDebt)}` : `net debt ${money(t.netDebt)}`}.</p>${flags}`;
}
