// Credit screen: a transparent first look at how much financial strain each company could take, from its 10-K figures.
// Pure functions, no I/O, so the page, the tests and the build tools share the maths. US dollars, millions.
// This is NOT a credit rating and does not predict default: the thresholds below are the author's choices (stated on the page).
import type { Company } from "../ma/screen.ts";
import { sampler, spearmanPermutationP } from "../stats.ts";

export type Cell = { value: number; tag: string; accn: string; filed: string; end: string; note?: string } | null;
export type ExtraMetric = "interest_expense" | "interest_paid" | "capex" | "assets_current" | "liabilities_current" | "liabilities" | "equity" | "retained_earnings";
export type Extra = { generated: string; companies: Record<string, { ticker: string; years: Record<string, Record<ExtraMetric, Cell>> }> };

export const FACTORS = ["leverage", "coverage", "fcf", "liquidity", "margin"] as const;
export type Factor = (typeof FACTORS)[number];
export const FACTOR_INFO: Record<Factor, { label: string; measure: string; anchors: string; weight: number }> = {
  leverage: { label: "Net leverage", measure: "Net debt / EBITDA", anchors: "100 if net cash; 85 at 2x, 55 at 4x, 25 at 6x, 0 at 8x or more; 0 if EBITDA is not positive", weight: 30 },
  coverage: { label: "Interest cover", measure: "EBITDA / interest expense", anchors: "100 with no debt; 0 at 1x, 25 at 2x, 55 at 4x, 85 at 8x, 100 at 15x or more", weight: 25 },
  fcf: { label: "Cash flow to debt", measure: "(Operating cash flow - capex) / debt", anchors: "100 with no debt; 0 at 0% or below, 40 at 10%, 65 at 20%, 100 at 40% or more", weight: 20 },
  liquidity: { label: "Liquidity", measure: "(Cash + short-term investments) / debt", anchors: "100 with no debt; 0 at 10% or below, 35 at 30%, 65 at 60%, 100 at 100% or more", weight: 15 },
  margin: { label: "Earnings margin", measure: "EBITDA / revenue", anchors: "0 at 0% or below, 40 at 10%, 75 at 25%, 100 at 40% or more", weight: 10 },
};
export const BUCKETS = [
  { name: "Low strain", min: 75 },
  { name: "Moderate strain", min: 55 },
  { name: "Elevated strain", min: 35 },
  { name: "High strain", min: -Infinity },
] as const;
export type BucketName = (typeof BUCKETS)[number]["name"];
export const bucketOf = (score: number): BucketName => BUCKETS.find((b) => score >= b.min)!.name;

export type Options = {
  includeRoyalty: boolean; // count sold-royalty obligations as debt (FY2025 only)
  leverageLimit: number; // for the headroom measure, like a covenant
  coverageFloor: number;
  shock: number; // EBITDA fall, 0 to 0.9, for the stress column
};
export const DEFAULT_OPTIONS: Options = { includeRoyalty: true, leverageLimit: 4, coverageFloor: 3, shock: 0.3 };

/** Linear interpolation through (x, y) anchors; flat outside the first and last anchor. */
export function interp(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

export type Raw = {
  revenue: number | null;
  ebitda: number | null;
  cfo: number | null;
  capex: number | null;
  debt: number | null; // gross debt incl. debt-like items when switched on
  cash: number | null; // cash plus short-term investments
  interest: number | null;
  interestIsCashPaid: boolean;
};

export type Ratios = {
  margin: number | null;
  netDebt: number | null;
  leverage: number | "net cash" | "n/m" | null;
  coverage: number | "no debt" | "n/m" | null;
  fcf: number | null;
  fcfToDebt: number | "no debt" | null;
  liquidity: number | "no debt" | null;
};

const NO_DEBT = 0.5; // below $0.5m of debt a company is treated as having none

export function ratiosFrom(r: Raw): Ratios {
  const noDebt = r.debt !== null && r.debt < NO_DEBT;
  const netDebt = r.debt !== null && r.cash !== null ? r.debt - r.cash : null;
  let leverage: Ratios["leverage"] = null;
  if (netDebt !== null) leverage = netDebt <= 0 ? "net cash" : r.ebitda !== null ? (r.ebitda > 0 ? netDebt / r.ebitda : "n/m") : null;
  let coverage: Ratios["coverage"] = null;
  if (noDebt) coverage = "no debt";
  else if (r.interest !== null && r.ebitda !== null) coverage = r.interest <= 0 ? "no debt" : r.ebitda > 0 ? r.ebitda / r.interest : "n/m";
  const fcf = r.cfo !== null ? r.cfo - (r.capex ?? 0) : null;
  const fcfToDebt: Ratios["fcfToDebt"] = noDebt ? "no debt" : fcf !== null && r.debt !== null ? fcf / r.debt : null;
  const liquidity: Ratios["liquidity"] = noDebt ? "no debt" : r.cash !== null && r.debt !== null ? r.cash / r.debt : null;
  return { margin: r.revenue && r.ebitda !== null ? r.ebitda / r.revenue : null, netDebt, leverage, coverage, fcf, fcfToDebt, liquidity };
}

export function factorScores(x: Ratios): Record<Factor, number | null> {
  const lev = x.leverage === null ? null : x.leverage === "net cash" ? 100 : x.leverage === "n/m" ? 0 : interp(x.leverage, [[0, 100], [2, 85], [4, 55], [6, 25], [8, 0]]);
  const cov = x.coverage === null ? null : x.coverage === "no debt" ? 100 : x.coverage === "n/m" ? 0 : interp(x.coverage, [[1, 0], [2, 25], [4, 55], [8, 85], [15, 100]]);
  const fcf = x.fcfToDebt === null ? null : x.fcfToDebt === "no debt" ? 100 : interp(x.fcfToDebt, [[0, 0], [0.1, 40], [0.2, 65], [0.4, 100]]);
  const liq = x.liquidity === null ? null : x.liquidity === "no debt" ? 100 : interp(x.liquidity, [[0.1, 0], [0.3, 35], [0.6, 65], [1, 100]]);
  const mar = x.margin === null ? null : interp(x.margin, [[0, 0], [0.1, 40], [0.25, 75], [0.4, 100]]);
  return { leverage: lev, coverage: cov, fcf, liquidity: liq, margin: mar };
}

/** Weighted score over the factors that exist; missing factors are dropped and the weights rescaled (and reported via coverage). */
export function totalScore(s: Record<Factor, number | null>): { score: number; used: number } | null {
  let w = 0;
  let acc = 0;
  for (const f of FACTORS) {
    const v = s[f];
    if (v === null) continue;
    w += FACTOR_INFO[f].weight;
    acc += v * FACTOR_INFO[f].weight;
  }
  return w === 0 ? null : { score: acc / w, used: w };
}

/** Largest fall in EBITDA the company can take before net leverage exceeds the limit or interest cover drops below the floor. */
export function headroom(r: Raw, leverageLimit: number, coverageFloor: number): { value: number; binding: "leverage" | "coverage" | "none" | "already" } | null {
  if (r.ebitda === null || r.debt === null || r.cash === null) return null;
  const netDebt = r.debt - r.cash;
  const e = r.ebitda;
  const interest = r.debt < NO_DEBT ? 0 : r.interest;
  if (interest === null) return null;
  if (e <= 0 && (netDebt > 0 || interest > 0)) return { value: 0, binding: "already" };
  const levRoom = netDebt > 0 ? 1 - netDebt / (leverageLimit * e) : Infinity;
  const covRoom = interest > 0 ? 1 - (coverageFloor * interest) / e : Infinity;
  const room = Math.min(levRoom, covRoom);
  if (room === Infinity) return { value: 1, binding: "none" };
  if (room <= 0) return { value: 0, binding: "already" };
  return { value: Math.min(1, room), binding: levRoom <= covRoom ? "leverage" : "coverage" };
}

/** One-year EBITDA shock: EBITDA and operating cash flow fall by the same amount (pre-tax, simplified); net debt rises by any cash burn. */
export function stress(r: Raw, shock: number): Raw {
  if (r.ebitda === null) return r;
  const drop = shock * Math.max(0, r.ebitda);
  const cfo = r.cfo === null ? null : r.cfo - drop;
  const fcf = cfo === null ? null : cfo - (r.capex ?? 0);
  const burn = fcf !== null && fcf < 0 ? -fcf : 0;
  return { ...r, ebitda: r.ebitda - drop, cfo, cash: r.cash === null ? null : r.cash - burn };
}

/** Altman Z'' (non-manufacturers, book equity): 6.56 X1 + 3.26 X2 + 6.72 X3 + 1.05 X4. Zones as commonly cited: above 2.6 safe, 1.1 to 2.6 grey, below 1.1 distress. */
export function altmanZpp(i: { workingCapital: number; retainedEarnings: number; ebit: number; equity: number; assets: number; liabilities: number }): { z: number; zone: "safe" | "grey" | "distress" } | null {
  if (i.assets <= 0 || i.liabilities <= 0) return null;
  const z = 6.56 * (i.workingCapital / i.assets) + 3.26 * (i.retainedEarnings / i.assets) + 6.72 * (i.ebit / i.assets) + 1.05 * (i.equity / i.liabilities);
  return { z, zone: z > 2.6 ? "safe" : z >= 1.1 ? "grey" : "distress" };
}

export type Row = {
  ticker: string;
  name: string;
  revenue: number | null;
  raw: Raw;
  ratios: Ratios;
  scores: Record<Factor, number | null>;
  score: number | null;
  used: number; // weight of the factors that could be scored, out of 100
  bucket: BucketName | null;
  stressedScore: number | null;
  stressedBucket: BucketName | null;
  headroom: ReturnType<typeof headroom>;
  altman: ReturnType<typeof altmanZpp>;
  flags: string[];
};

/** Everything the browser needs for one company, with royalty obligations kept apart so the switch can be applied without the full dataset. */
export type Compact = {
  ticker: string;
  name: string;
  debtLike: number; // sold-royalty obligations, FY2025 only
  years: Record<string, { raw: Raw; flags: string[] }>;
  altmanInputs: { workingCapital: number; retainedEarnings: number; ebit: number; equity: number; assets: number; liabilities: number } | null;
  baseFlags: string[]; // flags that do not depend on the options
};

const v = (c: Cell | undefined) => (c ? c.value : null);

/** Raw inputs for one company-year, with debt excluding debt-like items (added later, for FY2025 only). */
export function rawFor(c: Company, e: Extra["companies"][string] | undefined, year: number): { raw: Raw; flags: string[] } {
  const y = c.years[String(year)] ?? ({} as Company["years"][string]);
  const x = e?.years[String(year)];
  const flags: string[] = [];
  const op = v(y.operating_income);
  const da = v(y.da);
  const debt = v(y.debt);
  const cashV = v(y.cash);
  const inv = v(y.st_investments);
  const interestExp = v(x?.interest_expense);
  const interestPaid = v(x?.interest_paid);
  const interest = interestExp ?? interestPaid;
  const isPaid = interestExp === null && interestPaid !== null;
  if (isPaid) flags.push("Interest expense is not tagged; cash interest paid is used instead");
  if (debt !== null && debt >= NO_DEBT && interest === null) flags.push("Debt is reported but no interest figure was found, so interest cover is missing");
  if (x && v(x.capex) === null && v(y.cfo) !== null) flags.push("Capex not tagged: free cash flow equals operating cash flow");
  if (cashV === null) flags.push("Cash balance not found");
  if (inv === null) flags.push("No short-term investments tagged: liquidity may be understated");
  if (da === null && op !== null) flags.push("Depreciation and amortisation not found: EBITDA is missing");
  if (op === null) flags.push("Operating income not found: EBITDA is missing");
  return {
    raw: { revenue: v(y.revenue), ebitda: op !== null && da !== null ? op + da : null, cfo: v(y.cfo), capex: x ? v(x.capex) : null, debt, cash: cashV === null ? null : cashV + (inv ?? 0), interest, interestIsCashPaid: isPaid },
    flags,
  };
}

export function compact(c: Company, e: Extra["companies"][string] | undefined, years: number[] = [2022, 2023, 2024, 2025]): Compact {
  const out: Compact["years"] = {};
  for (const yr of years) out[String(yr)] = rawFor(c, e, yr);
  const y = c.years["2025"];
  const x = e?.years["2025"];
  const baseFlags: string[] = [];
  const ac = v(x?.assets_current);
  const cl = v(x?.liabilities_current);
  const assets = v(y.assets);
  const equity = v(x?.equity);
  let liab = v(x?.liabilities);
  if (liab === null && assets !== null && equity !== null) {
    liab = assets - equity;
    baseFlags.push("Total liabilities not tagged: taken as total assets less equity (includes any non-controlling or mezzanine items)");
  }
  const re = v(x?.retained_earnings);
  const op = v(y.operating_income);
  const altmanInputs = ac !== null && cl !== null && re !== null && op !== null && equity !== null && assets !== null && liab !== null ? { workingCapital: ac - cl, retainedEarnings: re, ebit: op, equity, assets, liabilities: liab } : null;
  if (c.docChecked === false) baseFlags.push("The 10-K text was not checked for debt-like obligations");
  return { ticker: c.ticker, name: c.name, debtLike: (c.debtLikeItems ?? []).reduce((a, i) => a + i.value, 0), years: out, altmanInputs, baseFlags };
}

/** One year of one company under the options: royalty switch (FY2025 only), scores, stress, headroom. */
export function rowFor(k: Compact, year: number, opts: Options): Row {
  const base = k.years[String(year)];
  const dl = year === 2025 ? k.debtLike : 0;
  const raw: Raw = { ...base.raw, debt: base.raw.debt === null ? null : base.raw.debt + (opts.includeRoyalty ? dl : 0) };
  const flags = [...base.flags, ...(year === 2025 ? k.baseFlags : [])];
  if (dl > 0) flags.push(`$${dl.toFixed(0)}m of sold-royalty obligations are ${opts.includeRoyalty ? "counted as debt" : "NOT counted as debt"}; they are repaid from royalty income, not in cash`);
  const ratios = ratiosFrom(raw);
  const scores = factorScores(ratios);
  const t = totalScore(scores);
  const st = totalScore(factorScores(ratiosFrom(stress(raw, opts.shock))));
  const altman = year === 2025 && k.altmanInputs ? altmanZpp(k.altmanInputs) : null;
  if (altman && k.altmanInputs!.retainedEarnings < 0 && altman.zone !== "safe") flags.push("Accumulated deficit (negative retained earnings) weighs on the Altman score; common for young biotechs that have never been profitable");
  if (t && t.used < 100) flags.push(`Scored on ${t.used}% of the weights; the rest was missing and the weights were rescaled`);
  if (ratios.leverage === "n/m") flags.push("EBITDA is not positive while the company has net debt: leverage is not meaningful and scores zero");
  return { ticker: k.ticker, name: k.name, revenue: raw.revenue, raw, ratios, scores, score: t ? t.score : null, used: t ? t.used : 0, bucket: t ? bucketOf(t.score) : null, stressedScore: st ? st.score : null, stressedBucket: st ? bucketOf(st.score) : null, headroom: headroom(raw, opts.leverageLimit, opts.coverageFloor), altman, flags: [...new Set(flags)] };
}

export function buildRows(companies: Company[], extra: Extra, opts: Options = DEFAULT_OPTIONS): Row[] {
  return companies.map((c) => rowFor(compact(c, extra.companies[c.ticker]), 2025, opts));
}

export function rankRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.ticker.localeCompare(b.ticker));
}

/** Score with a different set of weights (missing factors dropped and the rest rescaled, as in the main score). */
export function scoreWith(scores: Record<Factor, number | null>, weights: Record<Factor, number>): number | null {
  let w = 0;
  let acc = 0;
  for (const f of FACTORS) {
    const v = scores[f];
    if (v === null) continue;
    w += weights[f];
    acc += v * weights[f];
  }
  return w === 0 ? null : acc / w;
}

export type Robustness = { draws: number; perTicker: Record<string, { sameBand: number; rankLo: number; rankHi: number; rank: number }> };

/** Re-weights the five factors at random (each weight times exp(0.5 Z), as in the M&A screen) and records how often each company stays in its band and its rank range (5th to 95th percentile). */
export function weightRobustness(rows: Row[], o: { draws?: number; seed?: number } = {}): Robustness {
  const draws = o.draws ?? 1000;
  const s = sampler(o.seed ?? 1);
  const scored = rows.filter((r) => r.score !== null);
  const same: Record<string, number> = {};
  const rks: Record<string, number[]> = {};
  for (const r of scored) {
    same[r.ticker] = 0;
    rks[r.ticker] = [];
  }
  for (let d = 0; d < draws; d++) {
    const w = Object.fromEntries(FACTORS.map((f) => [f, FACTOR_INFO[f].weight * Math.exp(0.5 * s.normal())])) as Record<Factor, number>;
    const sc = scored.map((r) => ({ t: r.ticker, v: scoreWith(r.scores, w) as number }));
    const order = [...sc].sort((a, b) => b.v - a.v || a.t.localeCompare(b.t));
    order.forEach((x, i) => rks[x.t].push(i + 1));
    for (const r of scored) {
      const v = sc.find((x) => x.t === r.ticker)!.v;
      if (bucketOf(v) === r.bucket) same[r.ticker]++;
    }
  }
  const q = (a: number[], p: number) => {
    const b = [...a].sort((x, y) => x - y);
    const h = (b.length - 1) * p;
    return b[Math.floor(h)] + (b[Math.ceil(h)] - b[Math.floor(h)]) * (h - Math.floor(h));
  };
  const base = [...scored].sort((a, b) => (b.score as number) - (a.score as number) || a.ticker.localeCompare(b.ticker));
  const perTicker: Robustness["perTicker"] = {};
  for (const r of scored) perTicker[r.ticker] = { sameBand: same[r.ticker] / draws, rankLo: q(rks[r.ticker], 0.05), rankHi: q(rks[r.ticker], 0.95), rank: base.findIndex((x) => x.ticker === r.ticker) + 1 };
  return { draws, perTicker };
}

export type Validity = { label: string; n: number; rho: number | null; p: number | null; note: string };

/** Three exploratory checks on the 28 companies: does the score persist from FY2022 to FY2025, does it agree with Altman Z-double-prime, and does the FY2022 score line up with how EBITDA moved afterwards. Small samples: read as descriptions, not proof. */
export function validityChecks(ks: Compact[], opts: Options, draws = 5000): Validity[] {
  const o = { ...opts, includeRoyalty: false }; // royalty obligations exist for FY2025 only, so exclude them to keep the two years comparable
  const rows22 = ks.map((k) => rowFor(k, 2022, o));
  const rows25 = ks.map((k) => rowFor(k, 2025, o));
  const pairs = (f: (i: number) => [number, number] | null) => ks.map((_, i) => f(i)).filter((x): x is [number, number] => x !== null);
  const run = (label: string, ps: [number, number][], note: string): Validity => {
    const r = spearmanPermutationP(ps.map((x) => x[0]), ps.map((x) => x[1]), draws, 1);
    return { label, n: ps.length, rho: r ? r.rho : null, p: r ? r.p : null, note };
  };
  // Only companies scored on the full weights in the years compared: FY2022 debt is missing for several companies (the balance-sheet debt was read for FY2025 only), and a partial score is not comparable.
  const full = (r: Row) => r.score !== null && r.used === 100;
  const persist = pairs((i) => (full(rows22[i]) && full(rows25[i]) ? [rows22[i].score as number, rows25[i].score as number] : null));
  const alt = pairs((i) => (rows25[i].score !== null && rows25[i].altman ? [rows25[i].score as number, rows25[i].altman!.z] : null));
  const fut = pairs((i) => {
    const e22 = rows22[i].raw.ebitda;
    const e25 = rows25[i].raw.ebitda;
    return full(rows22[i]) && e22 !== null && e22 > 0 && e25 !== null ? [rows22[i].score as number, (e25 - e22) / e22] : null;
  });
  return [
    run("FY2022 score against FY2025 score", persist, "Does a company that scored well in FY2022 still score well three years later? Only companies scored on the full weights in both years."),
    run("FY2025 score against Altman Z″", alt, "Do the two credit measures rank the companies alike?"),
    run("FY2022 score against EBITDA growth to FY2025", fut, "Did companies that scored better in FY2022 see better earnings growth afterwards? Only companies with full FY2022 weights and positive FY2022 EBITDA."),
  ];
}
