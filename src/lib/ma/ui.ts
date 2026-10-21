// Browser behaviour for the M&A screening page: reads the controls, runs the screen and renders table, exclusions, sensitivity and memo.
import { CRITERIA, CRITERION_INFO, DEFAULT_FILTERS, DEFAULT_WEIGHTS, applyFilters, buildRows, memo, rank, score, sensitivity } from "./screen.ts";
import type { Criterion, Dataset, Filters, Outcome, Policy, Weights } from "./screen.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (x: number | null) => (x === null ? "n/a" : `$${Math.round(x).toLocaleString("en-US")}m`);
const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
const SEG = ["s0", "s1", "s2", "s3", "s4", "s5"];

function readControls(form: HTMLFormElement): { w: Weights; f: Filters; policy: Policy } | string {
  const get = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  const w = Object.fromEntries(CRITERIA.map((c) => [c, Number(get(`w-${c}`).value)])) as Weights;
  if (CRITERIA.every((c) => w[c] === 0)) return "Give at least one criterion a weight above zero.";
  const f: Filters = { minRevenue: Number(get("min-rev").value), maxRevenue: Number(get("max-rev").value), requireProfitable: get("req-profit").checked };
  if (!Number.isFinite(f.minRevenue) || !Number.isFinite(f.maxRevenue) || f.minRevenue < 0 || f.maxRevenue <= f.minRevenue) return "The revenue range needs a minimum below the maximum.";
  return { w, f, policy: (get("policy").value as Policy) ?? "renormalize" };
}

export function table(o: Outcome, policy: Policy): string {
  const body = o.ranked
    .map((r) => {
      const s = o.sens.perTicker[r.ticker];
      const row = r.s.row;
      const m = row.metrics;
      const bar = CRITERIA.map((c, i) => {
        const v = r.s.contributions[c];
        return v === null ? "" : `<span class="sseg ${SEG[i]}" style="width:${Math.max(0, v)}%" title="${esc(CRITERION_INFO[c].label)}: ${((row.scores[c] as number)).toFixed(0)}/100 (weight ${o.weights[c]})"></span>`;
      }).join("");
      const flags = row.flags.length
        ? `<details class="flags"><summary>${row.flags.length} flag${row.flags.length > 1 ? "s" : ""}</summary><ul>${row.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>`
        : "None";
      const miss = row.missing.length ? `<span class="muted"> · missing: ${row.missing.map((c) => CRITERION_INFO[c].label).join(", ")}</span>` : "";
      return `<tr><td class="num">${r.rank}</td><th scope="row">${esc(row.name)} <span class="tick">${esc(row.ticker)}</span>${miss}</th><td class="num strong">${r.s.score.toFixed(0)}</td><td><div class="sbar" role="img" aria-label="Score contributions by criterion">${bar}</div></td><td class="num">${money(m.revenue)}</td><td class="num">${pct(m.opMargin)}</td><td class="num">${pct(m.revenueCagr)}</td><td class="num">${s.p5}–${s.p95}</td><td class="num">${(s.top5Share * 100).toFixed(0)}%</td><td class="num">${policy === "renormalize" ? s.zeroPolicyRank : r.rank}</td><td>${flags}</td></tr>`;
    })
    .join("");
  return `<table class="tbl rank"><caption class="sr">Ranked shortlist</caption><thead><tr><th scope="col">Rank</th><th scope="col">Company</th><th scope="col">Score</th><th scope="col">Score by criterion</th><th scope="col">Revenue FY2025</th><th scope="col">Op. margin</th><th scope="col">Revenue CAGR 22–25</th><th scope="col">Rank range*</th><th scope="col">In top 5*</th><th scope="col">Rank if missing = 0</th><th scope="col">Data flags</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function excluded(o: Outcome): string {
  if (!o.excluded.length) return "<p class=\"muted\">No company was excluded.</p>";
  return `<ul class="excl">${o.excluded.map((e) => `<li><strong>${esc(e.row.name)}</strong> (${esc(e.row.ticker)}): ${esc(e.reasons.join("; "))}</li>`).join("")}</ul>`;
}

/** Server-side render of the default screen, so the page shows a result before (or without) JavaScript. */
export function defaultOutput(ds: Dataset, universeSize: number) {
  const rows = buildRows(ds);
  const { passed, excluded: ex } = applyFilters(rows, DEFAULT_FILTERS);
  const o: Outcome = { filters: DEFAULT_FILTERS, weights: DEFAULT_WEIGHTS, passed: passed.length, excluded: ex, ranked: rank(score(passed, DEFAULT_WEIGHTS)), sens: sensitivity(passed, DEFAULT_WEIGHTS, { draws: 1000 }) };
  return { table: table(o, "renormalize"), excluded: excluded(o), memo: memo(o, ds, universeSize), summary: `${passed.length} of ${rows.length} companies pass the filters; ${ex.length} excluded.` };
}

export function initScreen(ds: Dataset, universeSize: number) {
  const form = document.getElementById("screen-form") as HTMLFormElement | null;
  const out = document.getElementById("screen-out");
  const err = document.getElementById("screen-error");
  const memoEl = document.getElementById("memo-text");
  const exclEl = document.getElementById("excluded-out");
  const summary = document.getElementById("screen-summary");
  if (!form || !out || !err || !memoEl || !exclEl || !summary) return;
  const rows = buildRows(ds);
  let latest: string[] = [];

  const set = (name: string, v: string | number | boolean) => {
    const el = form.elements.namedItem(name) as HTMLInputElement;
    if (typeof v === "boolean") el.checked = v;
    else el.value = String(v);
  };
  const showValues = () => CRITERIA.forEach((c) => ((document.getElementById(`wv-${c}`) as HTMLElement).textContent = (form.elements.namedItem(`w-${c}`) as HTMLInputElement).value));

  const render = () => {
    showValues();
    const r = readControls(form);
    if (typeof r === "string") {
      err.textContent = r;
      err.hidden = false;
      return;
    }
    err.hidden = true;
    const { passed, excluded: ex } = applyFilters(rows, r.f);
    const o: Outcome = { filters: r.f, weights: r.w, passed: passed.length, excluded: ex, ranked: rank(score(passed, r.w, r.policy)), sens: sensitivity(passed, r.w, { draws: 1000 }) };
    summary.textContent = `${passed.length} of ${rows.length} companies pass the filters; ${ex.length} excluded.`;
    out.innerHTML = o.ranked.length ? table(o, r.policy) : "<p class=\"callout\">No company passes the current filters. Widen the revenue range or switch off the profit filter.</p>";
    exclEl.innerHTML = excluded(o);
    latest = memo(o, ds, universeSize);
    memoEl.replaceChildren(...latest.map((l) => Object.assign(document.createElement("p"), { textContent: l })));
  };

  let t: number | undefined;
  form.addEventListener("input", () => {
    window.clearTimeout(t);
    t = window.setTimeout(render, 100);
  });
  document.getElementById("screen-reset")?.addEventListener("click", () => {
    CRITERIA.forEach((c: Criterion) => set(`w-${c}`, DEFAULT_WEIGHTS[c]));
    set("min-rev", DEFAULT_FILTERS.minRevenue);
    set("max-rev", DEFAULT_FILTERS.maxRevenue);
    set("req-profit", DEFAULT_FILTERS.requireProfitable);
    set("policy", "renormalize");
    render();
  });
  document.getElementById("memo-copy")?.addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(latest.join("\n\n"));
      b.textContent = "Copied";
    } catch {
      b.textContent = "Copy failed: select the text instead";
    }
    window.setTimeout(() => (b.textContent = "Copy memo"), 2000);
  });
  render();
}
