// Draws and drives the scroll scenes (ScrollScene.astro). Each scene builds its visual from JSON and returns a function that takes the
// scroll progress (0 to 1) and redraws. Pinning is done with CSS sticky; GSAP's ScrollTrigger only reports the progress.
import { ScrollTrigger } from "./motion";

type Apply = (p: number) => void;
const NS = "http://www.w3.org/2000/svg";
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const svg = (tag: string, attrs: Record<string, string | number> = {}, parent?: Element) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e as SVGElement;
};
const html = (tag: string, cls: string, parent?: Element, text = "") => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
};
const bn = (m: number) => `$${(m / 1000).toFixed(1)}bn`;
const mm = (m: number) => `$${Math.round(m).toLocaleString("en-US")}m`;

// ---------------------------------------------------------------- LBO: the debt tower comes down
type LboData = { cols: { label: string; senior: number; sub: number; equity: number; ev: number; lev: number }[]; max: number; entry: number; sponsorEquity: number };
function lbo(host: HTMLElement, d: LboData): Apply {
  const W = 560;
  const H = 366;
  const base = 280;
  const top = 36;
  const bw = 54;
  const gap = (W - 56 - d.cols.length * bw) / (d.cols.length - 1);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "sv" }, host);
  svg("line", { x1: 28, x2: W - 28, y1: base, y2: base, class: "sv-axis" }, root);
  const scale = (base - top) / d.max;
  const parts = d.cols.map((c, j) => {
    const x = 28 + j * (bw + gap);
    const g = svg("g", { class: "sv-col" }, root);
    const eq = svg("rect", { x, width: bw, class: "sv-eq", rx: 4 }, g);
    const sub = svg("rect", { x, width: bw, class: "sv-sub", rx: 4 }, g);
    const sen = svg("rect", { x, width: bw, class: "sv-sen", rx: 4 }, g);
    const lab = svg("text", { x: x + bw / 2, y: base + 22, "text-anchor": "middle", class: "sv-lbl" }, g);
    lab.textContent = c.label;
    const lev = svg("text", { x: x + bw / 2, y: base + 40, "text-anchor": "middle", class: "sv-small" }, g);
    lev.textContent = `${Math.max(0, c.lev).toFixed(1)}x`;
    return { g, eq, sub, sen, c };
  });
  svg("text", { x: 28, y: H - 8, class: "sv-small" }, root).textContent = "Under each year: net debt / EBITDA. Value held at the entry multiple.";
  const head = html("div", "sv-head", host);
  const hLev = html("p", "sv-stat", head);
  const hEq = html("p", "sv-stat", head);
  const key = html("p", "sv-key", host);
  key.innerHTML = '<span class="k-eq">Equity</span><span class="k-sub">Subordinated debt</span><span class="k-sen">Senior debt</span>';
  return (p) => {
    const f = p * (d.cols.length - 1);
    parts.forEach(({ g, eq, sub, sen, c }, j) => {
      const v = j === 0 ? 1 : ease(f - (j - 1));
      const heq = Math.max(0, c.equity) * scale * v;
      const hsub = c.sub * scale * v;
      const hsen = c.senior * scale * v;
      eq.setAttribute("y", String(base - heq));
      eq.setAttribute("height", String(heq));
      sub.setAttribute("y", String(base - heq - hsub));
      sub.setAttribute("height", String(hsub));
      sen.setAttribute("y", String(base - heq - hsub - hsen));
      sen.setAttribute("height", String(hsen));
      g.style.opacity = String(j === 0 ? 1 : 0.25 + 0.75 * v);
    });
    const i0 = Math.min(d.cols.length - 2, Math.floor(f));
    const t = f - i0;
    const lev = lerp(d.cols[i0].lev, d.cols[i0 + 1].lev, t);
    const eqv = lerp(d.cols[i0].equity, d.cols[i0 + 1].equity, t);
    hLev.innerHTML = `Net debt <strong>${Math.max(0, lev).toFixed(1)}x</strong> EBITDA`;
    hEq.innerHTML = `Equity <strong>${mm(eqv)}</strong>`;
  };
}

// ---------------------------------------------------------------- credit: the dots slide as earnings fall
type CreditData = { shocks: number[]; tickers: string[]; scores: number[][] };
function credit(host: HTMLElement, d: CreditData): Apply {
  const W = 560;
  const H = 360;
  const left = 22;
  const right = W - 22;
  const n = d.tickers.length;
  const x = (s: number) => left + (s / 100) * (right - left);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "sv" }, host);
  const zones: [number, number, string][] = [[0, 35, "High"], [35, 55, "Elevated"], [55, 75, "Moderate"], [75, 100, "Low"]];
  const counts: SVGElement[] = [];
  zones.forEach(([a, b, name], k) => {
    svg("rect", { x: x(a), y: 44, width: x(b) - x(a), height: 290, class: `sv-zone z${k}` }, root);
    svg("text", { x: (x(a) + x(b)) / 2, y: 22, "text-anchor": "middle", class: "sv-lbl" }, root).textContent = name;
    counts.push(svg("text", { x: (x(a) + x(b)) / 2, y: 38, "text-anchor": "middle", class: "sv-count" }, root));
  });
  const dots = d.tickers.map((t, i) => {
    const c = svg("circle", { r: 5.2, cy: 56 + i * (264 / (n - 1)), class: "sv-dot" }, root);
    const title = svg("title", {}, c);
    title.textContent = t;
    return c;
  });
  const head = html("div", "sv-head", host);
  const hShock = html("p", "sv-stat", head);
  const hNow = html("p", "sv-stat", head);
  const band = (s: number) => (s >= 75 ? 3 : s >= 55 ? 2 : s >= 35 ? 1 : 0);
  return (p) => {
    const f = p * (d.shocks.length - 1);
    const i0 = Math.min(d.shocks.length - 2, Math.floor(f));
    const t = f - i0;
    const c = [0, 0, 0, 0];
    dots.forEach((dot, i) => {
      const s = lerp(d.scores[i0][i], d.scores[i0 + 1][i], t);
      dot.setAttribute("cx", String(x(s)));
      dot.setAttribute("class", `sv-dot b${band(s)}`);
      c[band(s)]++;
    });
    counts.forEach((el, k) => (el.textContent = String(c[k])));
    const shock = lerp(d.shocks[i0], d.shocks[i0 + 1], t);
    hShock.innerHTML = `EBITDA falls <strong>${Math.round(shock * 100)}%</strong>`;
    hNow.innerHTML = `Low strain <strong>${c[3]}</strong> of ${n}`;
  };
}

// ---------------------------------------------------------------- pharma: a DCF is five years and a very long tail
type PharmaData = { tiles: { label: string; cash: number; pv: number }[]; ev: number; tvShare: number };
function pharma(host: HTMLElement, d: PharmaData): Apply {
  const row = html("div", "dcf-row", host);
  const tiles = d.tiles.map((t, k) => {
    const el = html("div", `dcf-tile${k === d.tiles.length - 1 ? " dcf-tail" : ""}`, row);
    const name = html("span", "dcf-name", el, t.label);
    const val = html("strong", "dcf-val", el);
    return { el, val, name, t };
  });
  const head = html("div", "sv-head", host);
  const hEv = html("p", "sv-stat", head);
  const hTail = html("p", "sv-stat", head);
  const n = d.tiles.length;
  const share = d.tiles.map((t) => t.pv / d.ev);
  return (p) => {
    const a = ease(p / 0.3); // cash flows appear
    const b = ease((p - 0.33) / 0.27); // discounted to today
    const c = ease((p - 0.66) / 0.3); // the tail arrives and the widths become their true shares
    tiles.forEach(({ el, val, name, t }, k) => {
      const tail = k === n - 1;
      const w = lerp(100 / n, share[k] * 100, c);
      el.style.flexBasis = `${w}%`;
      name.style.display = val.style.display = w < 9 ? "none" : ""; // a sliver has no room for words
      el.style.opacity = String(0.15 + 0.85 * (tail ? c : a));
      val.textContent = tail ? (c < 0.02 ? "?" : bn(t.pv)) : bn(lerp(t.cash, t.pv, b));
    });
    const sum = tiles.reduce((s, { t }, k) => s + (k === n - 1 ? t.pv * c : t.pv * b + t.cash * (1 - b)), 0);
    hEv.innerHTML = c > 0.02 ? `Enterprise value <strong>${bn(sum)}</strong>` : `Five years, undiscounted: <strong>${bn(tiles.slice(0, n - 1).reduce((s, { t }) => s + lerp(t.cash, t.pv, b), 0))}</strong>`;
    hTail.innerHTML = c > 0.02 ? `Years 1 to 5: <strong>${Math.round((1 - d.tvShare) * 100)}%</strong> · after year 5: <strong>${Math.round(d.tvShare * 100)}%</strong>` : "";
  };
}

// ---------------------------------------------------------------- M&A: same companies, three buyers, three top fives
type MaData = { briefs: { name: string; summary: string }[]; tickers: string[]; names: Record<string, string>; ranks: (number | null)[][] };
function ma(host: HTMLElement, d: MaData): Apply {
  const rowH = 46;
  const list = html("div", "ma-list", host);
  list.style.height = `${rowH * 8.2}px`;
  const rows = d.tickers.map((t) => {
    const el = html("div", "ma-row", list);
    const rank = html("span", "ma-rank", el);
    html("span", "ma-name", el, d.names[t]);
    html("span", "ma-tick", el, t);
    return { el, rank };
  });
  html("div", "ma-out", list, "Outside the top five");
  const head = html("div", "sv-head", host);
  const hBrief = html("p", "sv-stat", head);
  const hSum = html("p", "sv-sum", head);
  return (p) => {
    const f = p * (d.briefs.length - 1);
    const i0 = Math.min(d.briefs.length - 2, Math.floor(f));
    const t = ease(f - i0);
    rows.forEach(({ el, rank }, k) => {
      const r0 = d.ranks[k][i0];
      const r1 = d.ranks[k][i0 + 1];
      const s0 = r0 ?? 7 + (k % 3) * 0.22;
      const s1 = r1 ?? 7 + (k % 3) * 0.22;
      const slot = lerp(s0, s1, t);
      el.style.transform = `translateY(${(slot - 1) * rowH}px)`;
      const inside = lerp(r0 ? 1 : 0.28, r1 ? 1 : 0.28, t);
      el.style.opacity = String(inside);
      const cur = t < 0.5 ? r0 : r1;
      rank.textContent = cur ? String(cur) : "";
    });
    const b = d.briefs[Math.round(f)];
    hBrief.innerHTML = `Buyer: <strong>${b.name}</strong>`;
    hSum.textContent = b.summary;
  };
}

// ---------------------------------------------------------------- research: a question takes one of three routes
type ResearchData = { questions: { q: string; route: number; outcome: string }[]; routes: string[] };
function research(host: HTMLElement, d: ResearchData): Apply {
  const card = html("div", "rs-card", host);
  const q = html("p", "rs-q", card);
  const chips = html("div", "rs-routes", card);
  const route = d.routes.map((r) => html("span", "rs-chip", chips, r));
  const out = html("p", "rs-out", card);
  html("p", "sv-sum", host, "Three real example questions from the tool below. Nothing is written by a language model.");
  const n = d.questions.length;
  return (p) => {
    const f = clamp(p, 0, 0.9999) * n;
    const k = Math.floor(f);
    const t = f - k; // progress within this question
    const item = d.questions[k];
    q.textContent = item.q.slice(0, Math.ceil(item.q.length * ease(t / 0.4))) + (t < 0.4 ? "\u258f" : "");
    const picked = t > 0.45;
    route.forEach((el, i) => el.classList.toggle("on", picked && i === item.route));
    out.textContent = t > 0.7 ? item.outcome : "";
    out.style.opacity = String(ease((t - 0.7) / 0.2));
  };
}

const kinds: Record<string, (host: HTMLElement, data: never) => Apply> = { lbo, credit, pharma, ma, research } as never;

document.querySelectorAll<HTMLElement>("[data-scene]").forEach((root) => {
  const host = root.querySelector<HTMLElement>(".scene-visual");
  const json = root.querySelector('script[type="application/json"]');
  const build = kinds[root.dataset.scene ?? ""];
  if (!host || !json || !build) return;
  const apply = build(host, JSON.parse(json.textContent ?? "{}") as never);
  const steps = Array.from(root.querySelectorAll<HTMLElement>(".scene-step"));
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply(1);
    return;
  }
  root.classList.add("scene-live");
  const n = steps.length;
  const update = (p: number) => {
    apply(p);
    steps.forEach((el, i) => {
      const d = p * n - i;
      const enter = i === 0 ? 1 : ease((d + 0.1) / 0.3);
      const exit = i === n - 1 ? 1 : ease((1 - d) / 0.2);
      const a = Math.min(enter, exit);
      el.style.opacity = String(a);
      el.style.transform = `translate3d(0, ${(1 - enter) * 40 - (1 - exit) * 30}px, 0)`;
    });
  };
  update(0);
  ScrollTrigger.create({ trigger: root, start: "top top", end: "bottom bottom", onUpdate: (s) => update(s.progress) });
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
});
