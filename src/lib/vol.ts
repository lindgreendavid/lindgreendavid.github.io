import type { Pt } from "./chart";

// Realised volatility of daily log returns, annualised (252 trading days), in percent.
// Rows are lookback windows, columns are dates, so the surface shows how volatility looks at different horizons over time.
export const WINDOWS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

export function volSurface(pts: Pt[]) {
  const r: number[] = [];
  for (let i = 1; i < pts.length; i++) r.push(Math.log(pts[i][1] / pts[i - 1][1]));
  const maxW = WINDOWS[WINDOWS.length - 1];
  const dates: string[] = [];
  for (let p = maxW; p < pts.length; p++) dates.push(pts[p][0]);
  const z = WINDOWS.map((w) =>
    dates.map((_, k) => {
      const p = maxW + k; // r[p - 1] is the return ending on pts[p]
      const slice = r.slice(p - w, p);
      const mean = slice.reduce((a, b) => a + b, 0) / w;
      const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (w - 1);
      return Math.sqrt(variance * 252) * 100;
    })
  );
  const flat = z.flat();
  return { z, dates, windows: WINDOWS, min: Math.min(...flat), max: Math.max(...flat) };
}
