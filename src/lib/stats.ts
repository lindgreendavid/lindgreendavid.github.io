// Small statistics helpers shared by the projects. Dependency-free and deterministic (seeded) so every number on a page can be reproduced.
import { rng } from "./ma/screen.ts";

/** Wilson score interval for a proportion k/n (Wilson 1927). Better than the normal interval for small n and for proportions near 0 or 1. */
export function wilson(k: number, n: number, z = 1.96): { lo: number; hi: number; p: number } {
  if (n <= 0) return { lo: 0, hi: 1, p: Number.NaN };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), p };
}

/** Parses "k/n" as printed in the evaluation summary. */
export function parseRatio(s: string): { k: number; n: number } {
  const [k, n] = s.split("/").map(Number);
  return { k, n };
}

/** Average ranks (ties share the mean rank), 1-based. */
export function ranks(x: number[]): number[] {
  const idx = x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(x.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k][1]] = r;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation (Pearson correlation of the average ranks). Null when either series is constant. */
export function spearman(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  const rx = ranks(x);
  const ry = ranks(y);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx);
  const my = mean(ry);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < rx.length; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

/** Quantile by linear interpolation between order statistics (type 7, the usual default). */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return Number.NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

/** Seeded draws: standard normal (Box-Muller) and triangular(min, mode, max). */
export function sampler(seed: number) {
  const u = rng(seed);
  const normal = () => {
    const a = Math.max(u(), 1e-12);
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
  };
  const triangular = (min: number, mode: number, max: number) => {
    const r = u();
    const c = (mode - min) / (max - min);
    return r < c ? min + Math.sqrt(r * (max - min) * (mode - min)) : max - Math.sqrt((1 - r) * (max - min) * (max - mode));
  };
  return { uniform: u, normal, triangular };
}

/** Two-sided permutation p-value for a Spearman correlation: the share of random re-pairings with a correlation at least as large in size (with +1 smoothing). */
export function spearmanPermutationP(x: number[], y: number[], draws = 5000, seed = 1): { rho: number; p: number } | null {
  const rho = spearman(x, y);
  if (rho === null) return null;
  const u = rng(seed);
  const shuffled = [...y];
  let extreme = 0;
  for (let d = 0; d < draws; d++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(u() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const r = spearman(x, shuffled);
    if (r !== null && Math.abs(r) >= Math.abs(rho) - 1e-12) extreme++;
  }
  return { rho, p: (extreme + 1) / (draws + 1) };
}
