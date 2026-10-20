// Rendering and interaction for the Pharma Valuation Explorer. The render functions return HTML strings, so the first view
// is produced on the server and the same code re-renders in the browser when someone changes an assumption.
import { dcfInputsFor, multiples, runDcf, SCENARIOS, sensitivity, sensitivityOperating } from "./model.ts";
import type { Dataset, DcfInputs, Grid } from "./model.ts";

const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
export const fmtM = (n: number) => nf0.format(Math.round(n));
export const fmtBn = (n: number) => `${nf1.format(n / 1000)}bn`;
export const fmtPct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
export const fmtX = (n: number) => (Number.isFinite(n) ? `${nf1.format(n)}x` : "n/a");
export const fmtUsd = (n: number) => `$${nf2.format(n)}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function heatmap(g: Grid, o: { corner: string; rowFmt: (n: number) => string; colFmt: (n: number) => string; valFmt: (n: number) => string; current?: [number, number] | null; caption: string }): string {
  const finite = g.values.flat().filter((v) => Number.isFinite(v));
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  let h = `<table class="heat"><caption>${esc(o.caption)}</caption><thead><tr><th scope="col">${esc(o.corner)}</th>${g.cols.map((c) => `<th scope="col">${o.colFmt(c)}</th>`).join("")}</tr></thead><tbody>`;
  g.rows.forEach((r, i) => {
    h += `<tr><th scope="row">${o.rowFmt(r)}</th>`;
    g.values[i].forEach((v, j) => {
      const t = Number.isFinite(v) ? (v - lo) / (hi - lo || 1) : 0;
      const cur = o.current && o.current[0] === i && o.current[1] === j;
      h += Number.isFinite(v) ? `<td style="--h:${t.toFixed(3)}"${cur ? ' class="cur" aria-label="current assumptions"' : ""}>${o.valFmt(v)}</td>` : `<td class="na">n/a</td>`;
    });
    h += `</tr>`;
  });
  return h + `</tbody></table>`;
}

const nearest = (arr: number[], x: number) => arr.reduce((b, v, i) => (Math.abs(v - x) < Math.abs(arr[b] - x) ? i : b), 0);

export const WACCS = [0.06, 0.065, 0.07, 0.075, 0.08, 0.085, 0.09];
export const GROWTHS = [0.01, 0.015, 0.02, 0.025, 0.03];
export const SHIFTS = [-0.02, -0.01, 0, 0.01, 0.02];
export const MARGINS = [0.21, 0.23, 0.25, 0.27, 0.29];

export function renderDcf(i: DcfInputs, marketCapUsdM?: number) {
  const r = runDcf(i);
  const g1 = sensitivity(i, WACCS, GROWTHS);
  const g2 = sensitivityOperating(i, SHIFTS, MARGINS);
  const summary = `
    <dl class="result">
      <div><dt>Enterprise value</dt><dd>$${fmtBn(r.enterpriseValue)}</dd></div>
      <div><dt>Equity value</dt><dd>$${fmtBn(r.equityValue)}</dd></div>
      <div class="big"><dt>Value per ordinary share</dt><dd>${fmtUsd(r.valuePerShare)}</dd></div>
      <div><dt>Terminal value share of enterprise value</dt><dd>${fmtPct(r.terminalShareOfEv, 0)}</dd></div>
      <div><dt>Implied EV / FY2025 revenue</dt><dd>${fmtX(r.impliedEvToBaseRevenue)}</dd></div>
      ${
        marketCapUsdM
          ? `<div><dt>Your market capitalisation vs this equity value</dt><dd>${fmtPct(marketCapUsdM / r.equityValue - 1, 0)} ${marketCapUsdM > r.equityValue ? "above" : "below"}</dd></div>`
          : ""
      }
    </dl>`;
  const years = `<table class="tbl"><caption>Free cash flow to the firm, USD millions</caption><thead><tr><th scope="col"></th>${r.years.map((y) => `<th scope="col">FY${y.year}</th>`).join("")}</tr></thead><tbody>
    ${[
      ["Revenue", (y: (typeof r.years)[number]) => fmtM(y.revenue)],
      ["Operating profit", (y: (typeof r.years)[number]) => fmtM(y.operatingProfit)],
      ["NOPAT", (y: (typeof r.years)[number]) => fmtM(y.nopat)],
      ["Plus: D&A", (y: (typeof r.years)[number]) => fmtM(y.da)],
      ["Less: capex", (y: (typeof r.years)[number]) => fmtM(-y.capex)],
      ["Less: working capital", (y: (typeof r.years)[number]) => fmtM(-y.nwc)],
      ["Free cash flow to the firm", (y: (typeof r.years)[number]) => fmtM(y.fcff)],
      ["Present value", (y: (typeof r.years)[number]) => fmtM(y.pv)],
    ]
      .map(([label, f]) => `<tr><th scope="row">${label as string}</th>${r.years.map((y) => `<td>${(f as (y: (typeof r.years)[number]) => string)(y)}</td>`).join("")}</tr>`)
      .join("")}
    </tbody></table>`;
  const bridge = `<table class="tbl"><caption>Enterprise-to-equity bridge, USD millions (31 Dec 2025 balance sheet)</caption><tbody>${r.bridge
    .map((b, n) => `<tr class="${n === 0 || n === r.bridge.length - 1 ? "sum" : ""}"><th scope="row">${esc(b.label)}</th><td>${fmtM(b.amount)}</td></tr>`)
    .join("")}</tbody></table>`;
  const cur1: [number, number] = [nearest(WACCS, i.wacc), nearest(GROWTHS, i.terminalGrowth)];
  const cur2: [number, number] = [nearest(SHIFTS, 0), nearest(MARGINS, i.targetMargin)];
  const sens1 = heatmap(g1, { corner: "WACC \\ growth", rowFmt: (n) => fmtPct(n), colFmt: (n) => fmtPct(n), valFmt: (n) => `$${nf0.format(n)}`, current: cur1, caption: "Value per ordinary share (USD): discount rate (rows) against terminal growth (columns)" });
  const sens2 = heatmap(g2, { corner: "Growth shift \\ margin", rowFmt: (n) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(0)} pts`, colFmt: (n) => fmtPct(n, 0), valFmt: (n) => `$${nf0.format(n)}`, current: cur2, caption: "Value per ordinary share (USD): change in yearly revenue growth (rows) against final-year operating margin (columns)" });
  return { r, summary, years, bridge, sens1, sens2 };
}

export function renderMultiples(ds: Dataset, caps: Record<string, number | undefined>, names: Record<string, string>): string {
  const rows = Object.entries(caps).filter(([, v]) => v && v > 0) as [string, number][];
  if (!rows.length) return `<p class="muted">Enter at least one market capitalisation above to see multiples. No share-price data is included, because none could be obtained from a source whose terms allow redistribution.</p>`;
  const m = rows.map(([c, cap]) => ({ c, m: multiples(ds, c, cap) }));
  return `<table class="tbl"><caption>Valuation multiples from your inputs and FY2025 filings (USD)</caption><thead><tr><th scope="col">Company</th><th scope="col">Market cap</th><th scope="col">Enterprise value</th><th scope="col">EV / revenue</th><th scope="col">EV / operating profit</th><th scope="col">P/E</th><th scope="col">FCF yield*</th></tr></thead><tbody>
  ${m.map(({ c, m: x }) => `<tr><th scope="row">${esc(names[c])}${x.ncIncluded && c === "gsk" ? " †" : ""}</th><td>$${fmtBn(x.marketCap)}</td><td>$${fmtBn(x.enterpriseValue)}</td><td>${fmtX(x.evToRevenue)}</td><td>${fmtX(x.evToOperatingProfit)}</td><td>${fmtX(x.priceToEarnings)}</td><td>${fmtPct(x.fcfYield)}</td></tr>`).join("")}
  </tbody></table>`;
}

// ---------------------------------------------------------------- browser behaviour

type Field = "g1" | "g2" | "g3" | "g4" | "g5" | "target" | "tax" | "da" | "capex" | "nwc" | "wacc" | "tg";
const FIELDS: Field[] = ["g1", "g2", "g3", "g4", "g5", "target", "tax", "da", "capex", "nwc", "wacc", "tg"];

export function setForm(form: HTMLFormElement, s: (typeof SCENARIOS)[string]) {
  const v: Record<Field, number> = { g1: s.growth[0], g2: s.growth[1], g3: s.growth[2], g4: s.growth[3], g5: s.growth[4], target: s.targetMargin, tax: s.taxRate, da: s.daPct, capex: s.capexPct, nwc: s.nwcPct, wacc: s.wacc, tg: s.terminalGrowth };
  for (const f of FIELDS) (form.elements.namedItem(f) as HTMLInputElement).value = (v[f] * 100).toFixed(1);
}

export function initPharma(ds: Dataset, names: Record<string, string>) {
  const form = document.getElementById("dcf-form") as HTMLFormElement | null;
  const mform = document.getElementById("mult-form") as HTMLFormElement | null;
  if (!form || !mform) return;
  const out = (id: string) => document.getElementById(id)!;
  const capOf = (c: string) => {
    const v = parseFloat((mform.elements.namedItem(`cap-${c}`) as HTMLInputElement).value);
    return Number.isFinite(v) && v > 0 ? v * 1000 : undefined; // entered in USD billions
  };

  const readInputs = (): DcfInputs | string => {
    const n = (f: Field) => parseFloat((form.elements.namedItem(f) as HTMLInputElement).value) / 100;
    const vals = FIELDS.map(n);
    if (vals.some((x) => !Number.isFinite(x))) return "Every assumption needs a number.";
    const base = dcfInputsFor(ds, SCENARIOS.base);
    const i: DcfInputs = { ...base, growth: [n("g1"), n("g2"), n("g3"), n("g4"), n("g5")], targetMargin: n("target"), taxRate: n("tax"), daPct: n("da"), capexPct: n("capex"), nwcPct: n("nwc"), wacc: n("wacc"), terminalGrowth: n("tg") };
    if (i.wacc <= i.terminalGrowth) return "The discount rate (WACC) must be higher than terminal growth, otherwise the terminal value is not defined.";
    if (i.taxRate < 0 || i.taxRate >= 1) return "The tax rate must be between 0% and 100%.";
    return i;
  };

  const renderAll = () => {
    const i = readInputs();
    const err = out("dcf-error");
    if (typeof i === "string") {
      err.textContent = i;
      err.hidden = false;
      ["dcf-summary", "dcf-years", "dcf-bridge", "sens1", "sens2"].forEach((id) => (out(id).innerHTML = ""));
    } else {
      err.hidden = true;
      const x = renderDcf(i, capOf("astrazeneca"));
      out("dcf-summary").innerHTML = x.summary;
      out("dcf-years").innerHTML = x.years;
      out("dcf-bridge").innerHTML = x.bridge;
      out("sens1").innerHTML = x.sens1;
      out("sens2").innerHTML = x.sens2;
    }
    const caps = Object.fromEntries(Object.keys(names).map((c) => [c, capOf(c)]));
    out("mult-out").innerHTML = renderMultiples(ds, caps, names);
  };

  let t: number | undefined;
  const later = () => {
    window.clearTimeout(t);
    t = window.setTimeout(renderAll, 120);
  };
  const scenario = form.elements.namedItem("scenario") as HTMLSelectElement;
  scenario.addEventListener("change", () => {
    if (scenario.value !== "custom") setForm(form, SCENARIOS[scenario.value]);
    renderAll();
  });
  for (const f of FIELDS) {
    (form.elements.namedItem(f) as HTMLInputElement).addEventListener("input", () => {
      scenario.value = "custom";
      later();
    });
  }
  mform.addEventListener("input", later);
  document.getElementById("dcf-reset")?.addEventListener("click", () => {
    scenario.value = "base";
    setForm(form, SCENARIOS.base);
    renderAll();
  });

  // Reporting-currency switch for the comparison table.
  const toggle = document.getElementById("cur-toggle") as HTMLInputElement | null;
  toggle?.addEventListener("change", () => {
    document.querySelectorAll<HTMLElement>("[data-usd]").forEach((el) => {
      el.textContent = toggle.checked ? (el.dataset.local ?? "") : (el.dataset.usd ?? "");
    });
  });
  renderAll();
}
