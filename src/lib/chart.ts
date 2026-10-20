// Shared by the server render and the browser, so the chart is identical with or without JavaScript.
export type Pt = [string, number];

export const W = 640;
export const H = 300;
export const PAD = { l: 8, r: 8, t: 20, b: 20 };

export function layout(pts: Pt[]) {
  const vals = pts.map(([, v]) => v);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const min = lo - span * 0.12;
  const max = hi + span * 0.12;
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, pts.length - 1);
  const y = (v: number) => PAD.t + ((max - v) / (max - min)) * (H - PAD.t - PAD.b);
  const line = pts.map(([, v], i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const base = H - PAD.b;
  const area = `${line}L${x(pts.length - 1).toFixed(1)} ${base}L${x(0).toFixed(1)} ${base}Z`;
  const grid = [0.25, 0.5, 0.75].map((f) => {
    const v = max - f * (max - min);
    return { y: y(v), label: v.toFixed(3) };
  });
  const latest = vals[vals.length - 1];
  return { x, y, line, area, grid, last: { x: x(pts.length - 1), y: y(latest) } };
}

export const fmtDate = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const pct = (from: number, to: number) => {
  const p = ((to - from) / from) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
};
