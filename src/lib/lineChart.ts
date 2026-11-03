// A small line chart for explaining one relationship: a few labelled lines, a marker for "your inputs", plain axes. Returns an SVG string,
// so the same code draws on the server and in the browser when an input changes.

export type Line = { label: string; points: [number, number | null][]; emphasis?: boolean };

export type LineChartOptions = {
  lines: Line[];
  xFmt: (x: number) => string;
  yFmt: (y: number) => string;
  xTitle: string;
  yTitle: string;
  xTicks: number[];
  yMin?: number;
  yMax?: number;
  marker?: { x: number; y: number; label: string };
  zero?: { y: number; label: string };
  label: string; // text description for screen readers
};

const W = 560;
const H = 320;
const PAD = { l: 56, r: 96, t: 28, b: 56 };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function lineChart(o: LineChartOptions): string {
  const ys = o.lines.flatMap((l) => l.points.map((p) => p[1]).filter((v): v is number => v !== null));
  if (!ys.length) return "";
  const lo0 = o.yMin ?? Math.min(...ys);
  const hi0 = o.yMax ?? Math.max(...ys);
  // round numbers on the vertical axis: a step of 1, 2, 2.5 or 5 times a power of ten
  const rawStep = (hi0 - lo0 || 1) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rawStep) ?? 10 * mag;
  const lo = o.yMin ?? Math.floor(lo0 / step) * step;
  const hi = o.yMax ?? Math.ceil(hi0 / step) * step;
  const xs = o.lines.flatMap((l) => l.points.map((p) => p[0]));
  const xLo = Math.min(...xs);
  const xHi = Math.max(...xs);
  const px = (x: number) => PAD.l + ((x - xLo) / (xHi - xLo || 1)) * (W - PAD.l - PAD.r);
  const py = (y: number) => H - PAD.b - ((y - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);

  let svg = `<svg class="lc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">`;
  // y axis: five even steps
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9; t += step) {
    const v = Math.abs(t) < 1e-9 ? 0 : t;
    svg += `<line class="lc-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${py(v)}" y2="${py(v)}"/><text class="lc-tick" x="${PAD.l - 8}" y="${py(v) + 4}" text-anchor="end">${esc(o.yFmt(v))}</text>`;
  }
  for (const t of o.xTicks) svg += `<text class="lc-tick" x="${px(t)}" y="${H - PAD.b + 20}" text-anchor="middle">${esc(o.xFmt(t))}</text>`;
  svg += `<text class="lc-title" x="${(PAD.l + W - PAD.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(o.xTitle)}</text>`;
  svg += `<text class="lc-title" x="14" y="${(PAD.t + H - PAD.b) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(PAD.t + H - PAD.b) / 2})">${esc(o.yTitle)}</text>`;
  if (o.zero && o.zero.y >= lo && o.zero.y <= hi) svg += `<line class="lc-zero" x1="${PAD.l}" x2="${W - PAD.r}" y1="${py(o.zero.y)}" y2="${py(o.zero.y)}"/><text class="lc-note" x="${PAD.l + 6}" y="${py(o.zero.y) - 6}">${esc(o.zero.label)}</text>`;

  // lines: the emphasised one is drawn last so it sits on top
  const ordered = [...o.lines].sort((a, b) => Number(!!a.emphasis) - Number(!!b.emphasis));
  const ends: { y: number; text: string; emph: boolean }[] = [];
  for (const l of ordered) {
    let d = "";
    let pen = false;
    for (const [x, y] of l.points) {
      if (y === null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${px(x).toFixed(1)} ${py(y).toFixed(1)} `;
      pen = true;
    }
    svg += `<path class="s ${l.emphasis ? "s-emph" : "s-dim"}" pathLength="1" d="${d.trim()}"/>`;
    const last = [...l.points].reverse().find((p) => p[1] !== null);
    if (last) ends.push({ y: py(last[1] as number), text: l.label, emph: !!l.emphasis });
  }
  // direct labels at the right end of each line, pushed apart so they never overlap
  ends.sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
  for (const e of ends) svg += `<text class="lc-lbl${e.emph ? " lc-lbl-emph" : ""}" x="${W - PAD.r + 8}" y="${e.y + 4}">${esc(e.text)}</text>`;

  if (o.marker) {
    const mx = px(o.marker.x);
    const my = py(o.marker.y);
    const above = my > PAD.t + 26;
    svg += `<circle class="lc-mark" cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="6"/><text class="lc-mark-lbl" x="${Math.min(W - PAD.r - 4, Math.max(PAD.l + 4, mx)).toFixed(1)}" y="${(above ? my - 14 : my + 24).toFixed(1)}" text-anchor="middle">${esc(o.marker.label)}</text>`;
  }
  return svg + "</svg>";
}
