// Small dependency-free SVG charts. They return strings so they can render on the server and need no script.
// Colours come from CSS classes (see projects.css), so both themes work.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type BarSeries = { name: string; values: number[] };

/** Bars grouped by category (company); one bar per series (year), darker for later years. */
export function groupedBars(o: { categories: string[]; series: BarSeries[]; format: (n: number) => string; label: string; height?: number }): string {
  const W = 640;
  const H = o.height ?? 300;
  const pad = { l: 12, r: 12, t: 28, b: 44 };
  const max = Math.max(...o.series.flatMap((s) => s.values)) * 1.12;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const groupW = innerW / o.categories.length;
  const barW = Math.min(46, (groupW * 0.72) / o.series.length);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  let svg = `<svg class="pc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">`;
  for (let f = 0; f <= 4; f++) {
    const gy = pad.t + (innerH * f) / 4;
    svg += `<line class="pc-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${gy}" y2="${gy}"/>`;
  }
  o.categories.forEach((cat, ci) => {
    const gx = pad.l + ci * groupW + groupW / 2;
    o.series.forEach((s, si) => {
      const x = gx - (barW * o.series.length) / 2 + si * barW;
      const v = s.values[ci];
      svg += `<rect class="pc-bar b${si}" x="${x + 1.5}" y="${y(v)}" width="${barW - 3}" height="${pad.t + innerH - y(v)}" rx="3"><title>${esc(cat)} ${esc(s.name)}: ${esc(o.format(v))}</title></rect>`;
      if (si === o.series.length - 1) svg += `<text class="pc-val" x="${x + barW / 2}" y="${y(v) - 7}" text-anchor="middle">${esc(o.format(v))}</text>`;
    });
    svg += `<text class="pc-cat" x="${gx}" y="${H - 22}" text-anchor="middle">${esc(cat)}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

export type LineSeries = { name: string; values: number[] };

/** Lines across periods with direct labels at the right edge and a different marker per series. */
export function lines(o: { periods: string[]; series: LineSeries[]; format: (n: number) => string; label: string; height?: number }): string {
  const W = 640;
  const H = o.height ?? 300;
  const pad = { l: 44, r: 132, t: 24, b: 40 };
  const all = o.series.flatMap((s) => s.values);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const min = lo - span * 0.2;
  const max = hi + span * 0.2;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (i * innerW) / Math.max(1, o.periods.length - 1);
  const y = (v: number) => pad.t + innerH - ((v - min) / (max - min)) * innerH;
  let svg = `<svg class="pc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">`;
  for (let f = 0; f <= 4; f++) {
    const v = min + ((max - min) * f) / 4;
    const gy = y(v);
    svg += `<line class="pc-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${gy}" y2="${gy}"/><text class="pc-axis" x="${pad.l - 8}" y="${gy + 4}" text-anchor="end">${esc(o.format(v))}</text>`;
  }
  o.periods.forEach((p, i) => (svg += `<text class="pc-cat" x="${x(i)}" y="${H - 14}" text-anchor="middle">${esc(p)}</text>`));
  // End labels sit at each line's last value; nudge them apart so close values do not overlap.
  const ends = o.series.map((s, si) => ({ si, y: y(s.values[s.values.length - 1]) + 4 })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;
  const endY = Object.fromEntries(ends.map((e) => [e.si, e.y]));
  o.series.forEach((s, si) => {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
    svg += `<path class="pc-line l${si}" d="${d}"/>`;
    s.values.forEach((v, i) => {
      const cx = x(i);
      const cy = y(v);
      const shape = si === 0 ? `<circle class="pc-dot l${si}" cx="${cx}" cy="${cy}" r="5"/>` : si === 1 ? `<rect class="pc-dot l${si}" x="${cx - 4.5}" y="${cy - 4.5}" width="9" height="9"/>` : `<path class="pc-dot l${si}" d="M${cx} ${cy - 6}L${cx + 6} ${cy}L${cx} ${cy + 6}L${cx - 6} ${cy}Z"/>`;
      svg += `${shape}<title>${esc(s.name)} ${esc(o.periods[i])}: ${esc(o.format(v))}</title>`;
    });
    const last = s.values[s.values.length - 1];
    svg += `<text class="pc-end l${si}" x="${x(s.values.length - 1) + 12}" y="${endY[si]}">${esc(s.name)} ${esc(o.format(last))}</text>`;
  });
  svg += `</svg>`;
  return svg;
}
