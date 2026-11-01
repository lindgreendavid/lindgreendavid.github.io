// Small dependency-free SVG charts for the LBO page. They return strings so the first view is drawn on the server and needs no script.
// Colours come from CSS classes in projects.css, so both themes work.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type Step = { label: string; value: number; kind: "total" | "delta" };

/** Waterfall: totals start from zero, deltas float from the running level. Negative deltas are drawn in the muted tone. */
export function waterfall(o: { steps: Step[]; format: (n: number) => string; label: string; height?: number }): string {
  const W = 520;
  const H = o.height ?? 320;
  const pad = { l: 12, r: 12, t: 30, b: 58 };
  let level = 0;
  const bars = o.steps.map((s) => {
    const from = s.kind === "total" ? 0 : level;
    const to = s.kind === "total" ? s.value : level + s.value;
    level = to;
    return { s, lo: Math.min(from, to), hi: Math.max(from, to), end: to };
  });
  const top = Math.max(...bars.map((b) => b.hi), 0) * 1.1;
  const bottom = Math.min(...bars.map((b) => b.lo), 0) * 1.1;
  const innerH = H - pad.t - pad.b;
  const innerW = W - pad.l - pad.r;
  const y = (v: number) => pad.t + innerH - ((v - bottom) / (top - bottom || 1)) * innerH;
  const slot = innerW / bars.length;
  const bw = Math.min(70, slot * 0.62);
  let svg = `<svg class="pc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">`;
  for (let f = 0; f <= 4; f++) {
    const gy = pad.t + (innerH * f) / 4;
    svg += `<line class="pc-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${gy}" y2="${gy}"/>`;
  }
  svg += `<line class="pc-zero" x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  bars.forEach((b, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const cls = b.s.kind === "total" ? "wf-total" : b.s.value >= 0 ? "wf-up" : "wf-down";
    const h = Math.max(1.5, y(b.lo) - y(b.hi));
    svg += `<rect class="${cls}" x="${cx - bw / 2}" y="${y(b.hi)}" width="${bw}" height="${h}" rx="3"><title>${esc(b.s.label)}: ${esc(o.format(b.s.value))}</title></rect>`;
    const sign = b.s.kind === "delta" && b.s.value > 0 ? "+" : "";
    svg += `<text class="pc-val" x="${cx}" y="${y(b.hi) - 7}" text-anchor="middle">${sign}${esc(o.format(b.s.value))}</text>`;
    // two-line category labels
    const words = b.s.label.split(" ");
    const mid = Math.ceil(words.length / 2);
    const l1 = words.slice(0, mid).join(" ");
    const l2 = words.slice(mid).join(" ");
    svg += `<text class="pc-cat" x="${cx}" y="${H - 34}" text-anchor="middle">${esc(l1)}</text>`;
    if (l2) svg += `<text class="pc-cat" x="${cx}" y="${H - 18}" text-anchor="middle">${esc(l2)}</text>`;
  });
  return svg + `</svg>`;
}

export type StackColumn = { label: string; parts: number[]; note?: string };

/** Stacked columns (for example senior debt, subordinated debt) with a small note above each column. */
export function stacked(o: { columns: StackColumn[]; partNames: string[]; format: (n: number) => string; label: string; height?: number }): string {
  const W = 520;
  const H = o.height ?? 300;
  const pad = { l: 12, r: 12, t: 34, b: 34 };
  const max = Math.max(...o.columns.map((c) => c.parts.reduce((a, b) => a + b, 0)), 1) * 1.08;
  const innerH = H - pad.t - pad.b;
  const innerW = W - pad.l - pad.r;
  const slot = innerW / o.columns.length;
  const bw = Math.min(64, slot * 0.62);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  let svg = `<svg class="pc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">`;
  for (let f = 0; f <= 4; f++) {
    const gy = pad.t + (innerH * f) / 4;
    svg += `<line class="pc-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${gy}" y2="${gy}"/>`;
  }
  o.columns.forEach((c, i) => {
    const cx = pad.l + slot * i + slot / 2;
    let run = 0;
    c.parts.forEach((p, k) => {
      if (p <= 0) return;
      svg += `<rect class="st-${k}" x="${cx - bw / 2}" y="${y(run + p)}" width="${bw}" height="${Math.max(0, y(run) - y(run + p))}" rx="3"><title>${esc(c.label)} ${esc(o.partNames[k])}: ${esc(o.format(p))}</title></rect>`;
      run += p;
    });
    const total = c.parts.reduce((a, b) => a + b, 0);
    svg += `<text class="pc-val" x="${cx}" y="${y(total) - 8}" text-anchor="middle">${esc(c.note ?? o.format(total))}</text>`;
    svg += `<text class="pc-cat" x="${cx}" y="${H - 12}" text-anchor="middle">${esc(c.label)}</text>`;
  });
  return svg + `</svg>`;
}
