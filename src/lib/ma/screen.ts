// Screening model for the Strategic M&A Screening Workbench. Pure functions: no DOM, no I/O, so everything is testable in Node.
// It ranks companies against a HYPOTHETICAL buyer brief using public fundamentals. It is a screening aid only:
// no valuation, no synergies, no financing, no accretion or LBO maths, and no view on whether a deal is feasible.

export type Cell = { value: number; tag: string; accn: string; filed: string; end: string; note?: string } | null;
export type YearData = Record<"revenue" | "operating_income" | "net_income" | "rnd" | "cfo" | "da" | "cash" | "debt" | "st_investments" | "assets", Cell>;
export type Company = { ticker: string; name: string; sic: string; sicDescription: string; fiscalYearEnd: string; debtLike?: string; docChecked?: boolean; years: Record<string, YearData> };
export type Dataset = { generated: string; companies: Record<string, Company> };

export const CRITERIA = ["scale", "growth", "margin", "cash", "leverage", "rnd"] as const;
export type Criterion = (typeof CRITERIA)[number];
export type Weights = Record<Criterion, number>;

export const CRITERION_INFO: Record<Criterion, { label: string; measure: string; anchors: string }> = {
  scale: { label: "Scale fit", measure: "FY2025 revenue", anchors: "0 at $150m, 100 from $300m to $1,500m, back to 0 at $3,000m" },
  growth: { label: "Growth", measure: "Revenue CAGR FY2022 to FY2025", anchors: "0 at 0% or below, 100 at 30% or more" },
  margin: { label: "Profitability", measure: "FY2025 operating margin", anchors: "0 at 0% or below, 100 at 40% or more" },
  cash: { label: "Cash generation", measure: "FY2025 operating cash flow / revenue", anchors: "0 at 0% or below, 100 at 35% or more" },
  leverage: { label: "Balance sheet", measure: "FY2025 net debt / EBITDA", anchors: "100 at net cash, 0 at 4.0x or more" },
  rnd: { label: "R&D reinvestment", measure: "FY2025 R&D / revenue", anchors: "0 at 0%, 100 from 10% to 30%, back to 0 at 60%" },
};

export const DEFAULT_WEIGHTS: Weights = { scale: 15, growth: 25, margin: 25, cash: 15, leverage: 10, rnd: 10 };

export type Filters = { minRevenue: number; maxRevenue: number; requireProfitable: boolean };
export const DEFAULT_FILTERS: Filters = { minRevenue: 150, maxRevenue: 3000, requireProfitable: true };

export type Policy = "renormalize" | "zero";

export type Metrics = {
  revenue: number | null;
  revenueCagr: number | null;
  opMargin: number | null;
  cfoMargin: number | null;
  rndIntensity: number | null;
  netDebt: number | null;
  ebitda: number | null;
  leverage: number | "net cash" | "n/m" | null;
  operatingIncome: number | null;
  revenue2022: number | null;
};

const v = (c: Cell | undefined) => (c ? c.value : null);

export function metricsFor(c: Company): { m: Metrics; flags: string[]; missing: Criterion[] } {
  const y25 = c.years["2025"];
  const y22 = c.years["2022"];
  const flags: string[] = [];
  const rev = v(y25.revenue);
  const rev22 = v(y22?.revenue);
  const op = v(y25.operating_income);
  const cfo = v(y25.cfo);
  const rnd = v(y25.rnd);
  const da = v(y25.da);
  const debt = v(y25.debt);
  const cash = v(y25.cash);
  const inv = v(y25.st_investments);

  const revenueCagr = rev && rev22 && rev > 0 && rev22 > 0 ? Math.pow(rev / rev22, 1 / 3) - 1 : null;
  if (rev22 !== null && rev22 > 0 && rev22 < 25) flags.push(`FY2022 revenue was only $${rev22.toFixed(0)}m, so growth is measured from a very small base`);
  if (rev22 === null) flags.push("FY2022 revenue not found: growth cannot be computed");
  if (rev === null) flags.push("FY2025 revenue not found");
  if (op === null) flags.push("FY2025 operating income not found");
  if (cfo === null) flags.push("FY2025 operating cash flow not found");
  if (rnd === null) flags.push("R&D expense not found in the XBRL data (the company may report none, or tag it differently)");
  if (debt === null) flags.push("No debt balance found in the XBRL data: the company may have no borrowings, but that is not confirmed here");
  if (da === null) flags.push("Depreciation and amortisation not found: EBITDA is unavailable unless the company is in net cash");
  if (cash === null) flags.push("Cash balance not found");
  if (inv === null) flags.push("No short-term investments found: net debt deducts cash only, so liquidity may be understated");
  if (c.fiscalYearEnd !== "1231") flags.push("52/53-week fiscal year: periods end near, not on, 31 December");
  for (const y of [2022, 2023, 2024, 2025] as const) {
    for (const cell of Object.values(c.years[String(y)] ?? {})) if (cell?.note) { flags.push(`Different tag used in some year (${cell.note})`); break; }
  }

  if (c.debtLike) flags.push(`${c.debtLike}; leverage is treated as unavailable for this company`);
  if (c.docChecked === false) flags.push("The 10-K text was not checked for debt-like obligations");
  if (rev && op !== null && op / rev >= 0.4) flags.push("Operating margin of 40% or more: check the filing for one-off items such as licence or milestone revenue");
  if (revenueCagr !== null && revenueCagr >= 0.4) flags.push("Revenue CAGR of 40% or more: check for one-off revenue and acquisitions");

  const netDebt = debt !== null && cash !== null ? debt - cash - (inv ?? 0) : null;
  const ebitda = op !== null && da !== null ? op + da : null;
  let leverage: Metrics["leverage"] = null;
  if (netDebt !== null && !c.debtLike) {
    if (netDebt <= 0) leverage = "net cash";
    else if (ebitda !== null) leverage = ebitda > 0 ? netDebt / ebitda : "n/m";
  }
  const m: Metrics = {
    revenue: rev,
    revenueCagr,
    opMargin: rev && op !== null ? op / rev : null,
    cfoMargin: rev && cfo !== null ? cfo / rev : null,
    rndIntensity: rev && rnd !== null ? rnd / rev : null,
    netDebt,
    ebitda,
    leverage,
    operatingIncome: op,
    revenue2022: rev22,
  };
  const missing: Criterion[] = [];
  if (m.revenue === null) missing.push("scale");
  if (m.revenueCagr === null) missing.push("growth");
  if (m.opMargin === null) missing.push("margin");
  if (m.cfoMargin === null) missing.push("cash");
  if (m.leverage === null) missing.push("leverage");
  if (m.rndIntensity === null) missing.push("rnd");
  return { m, flags: [...new Set(flags)], missing };
}

/** Linear interpolation through (x, y) anchor points; flat outside the first and last anchor. */
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

/** 0 to 100 score per criterion against the brief's anchors (see CRITERION_INFO). Null when the metric is missing. */
export function criterionScores(m: Metrics): Record<Criterion, number | null> {
  return {
    scale: m.revenue === null ? null : interp(m.revenue, [[150, 0], [300, 100], [1500, 100], [3000, 0]]),
    growth: m.revenueCagr === null ? null : interp(m.revenueCagr, [[0, 0], [0.3, 100]]),
    margin: m.opMargin === null ? null : interp(m.opMargin, [[0, 0], [0.4, 100]]),
    cash: m.cfoMargin === null ? null : interp(m.cfoMargin, [[0, 0], [0.35, 100]]),
    leverage: m.leverage === null ? null : m.leverage === "net cash" ? 100 : m.leverage === "n/m" ? 0 : interp(m.leverage, [[0, 100], [4, 0]]),
    rnd: m.rndIntensity === null ? null : interp(m.rndIntensity, [[0, 0], [0.1, 100], [0.3, 100], [0.6, 0]]),
  };
}

export type Row = {
  ticker: string;
  name: string;
  metrics: Metrics;
  flags: string[];
  missing: Criterion[];
  scores: Record<Criterion, number | null>;
};

export function buildRows(ds: Dataset): Row[] {
  return Object.values(ds.companies).map((c) => {
    const { m, flags, missing } = metricsFor(c);
    return { ticker: c.ticker, name: c.name, metrics: m, flags, missing, scores: criterionScores(m) };
  });
}

export type Excluded = { row: Row; reasons: string[] };

/** Hard filters. Missing FY2025 revenue or operating income, or FY2022 revenue, always excludes (the screen cannot judge the company). */
export function applyFilters(rows: Row[], f: Filters): { passed: Row[]; excluded: Excluded[] } {
  const passed: Row[] = [];
  const excluded: Excluded[] = [];
  for (const r of rows) {
    const why: string[] = [];
    const m = r.metrics;
    if (m.revenue === null || m.operatingIncome === null || m.revenue2022 === null) why.push("core data missing (FY2025 revenue, FY2025 operating income or FY2022 revenue)");
    if (m.revenue !== null && m.revenue < f.minRevenue) why.push(`revenue $${m.revenue.toFixed(0)}m is below the $${f.minRevenue}m minimum`);
    if (m.revenue !== null && m.revenue > f.maxRevenue) why.push(`revenue $${m.revenue.toFixed(0)}m is above the $${f.maxRevenue}m maximum`);
    if (f.requireProfitable && m.operatingIncome !== null && m.operatingIncome <= 0) why.push(`operating income is ${m.operatingIncome < 0 ? "negative" : "zero"} ($${m.operatingIncome.toFixed(0)}m)`);
    (why.length ? excluded.push({ row: r, reasons: why }) : passed.push(r));
  }
  return { passed, excluded };
}

export type Scored = { row: Row; score: number; coverage: number; contributions: Record<Criterion, number | null> };

/**
 * Weighted composite. "renormalize": a missing criterion is dropped and the other weights are rescaled (the company is flagged,
 * and `coverage` shows the share of weight actually used). "zero": a missing criterion scores 0 (a pessimistic view).
 */
export function score(rows: Row[], w: Weights, policy: Policy = "renormalize"): Scored[] {
  const total = CRITERIA.reduce((s, c) => s + w[c], 0);
  return rows.map((row) => {
    const avail = CRITERIA.filter((c) => row.scores[c] !== null);
    const usedW = policy === "renormalize" ? avail.reduce((s, c) => s + w[c], 0) : total;
    const contributions = Object.fromEntries(CRITERIA.map((c) => [c, row.scores[c] === null ? null : usedW > 0 ? (w[c] * (row.scores[c] as number)) / usedW : 0])) as Record<Criterion, number | null>;
    const s = avail.reduce((acc, c) => acc + (contributions[c] as number), 0);
    return { row, score: s, coverage: total > 0 ? avail.reduce((x, c) => x + w[c], 0) / total : 1, contributions };
  });
}

/** Competition ranking, best first; ties share the lower rank number. Ties are broken by ticker only for display order. */
export function rank(scored: Scored[]): { ticker: string; rank: number; s: Scored }[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score || a.row.ticker.localeCompare(b.row.ticker));
  let last = Infinity;
  let r = 0;
  return sorted.map((s, i) => {
    if (Math.abs(s.score - last) > 1e-9) r = i + 1;
    last = s.score;
    return { ticker: s.row.ticker, rank: r, s };
  });
}

/** Small seeded generator (mulberry32) so sensitivity results are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Sensitivity = {
  draws: number;
  perTicker: Record<string, { median: number; p5: number; p95: number; top5Share: number; oneAtATimeMin: number; oneAtATimeMax: number; zeroPolicyRank: number }>;
};

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

/**
 * How much do ranks depend on the chosen weights?
 *  - one-at-a-time: each weight halved and raised by half, the others unchanged;
 *  - random: `draws` weightings, each weight multiplied by exp(N(0, 0.5)) (roughly x0.6 to x1.65), seeded;
 *  - policy: rank when missing criteria score 0.
 */
export function sensitivity(rows: Row[], w: Weights, opts: { draws?: number; seed?: number } = {}): Sensitivity {
  const draws = opts.draws ?? 2000;
  const rand = rng(opts.seed ?? 20261020);
  const norm = () => {
    // Box-Muller
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const ranksFor = (ww: Weights, policy: Policy = "renormalize") => Object.fromEntries(rank(score(rows, ww, policy)).map((x) => [x.ticker, x.rank]));
  const perTicker: Sensitivity["perTicker"] = {};
  const samples: Record<string, number[]> = Object.fromEntries(rows.map((r) => [r.ticker, [] as number[]]));
  for (let i = 0; i < draws; i++) {
    const ww = Object.fromEntries(CRITERIA.map((c) => [c, w[c] * Math.exp(0.5 * norm())])) as Weights;
    const rk = ranksFor(ww);
    for (const t of Object.keys(samples)) samples[t].push(rk[t]);
  }
  const oat: Record<string, number[]> = Object.fromEntries(rows.map((r) => [r.ticker, [] as number[]]));
  for (const c of CRITERIA) for (const f of [0.5, 1.5]) {
    const rk = ranksFor({ ...w, [c]: w[c] * f });
    for (const t of Object.keys(oat)) oat[t].push(rk[t]);
  }
  const zero = ranksFor(w, "zero");
  for (const r of rows) {
    const s = [...samples[r.ticker]].sort((a, b) => a - b);
    perTicker[r.ticker] = {
      median: quantile(s, 0.5),
      p5: quantile(s, 0.05),
      p95: quantile(s, 0.95),
      top5Share: samples[r.ticker].filter((x) => x <= 5).length / draws,
      oneAtATimeMin: Math.min(...oat[r.ticker]),
      oneAtATimeMax: Math.max(...oat[r.ticker]),
      zeroPolicyRank: zero[r.ticker],
    };
  }
  return { draws, perTicker };
}

export type Outcome = {
  filters: Filters;
  weights: Weights;
  passed: number;
  excluded: Excluded[];
  ranked: { ticker: string; rank: number; s: Scored }[];
  sens: Sensitivity;
};

export function run(ds: Dataset, weights: Weights = DEFAULT_WEIGHTS, filters: Filters = DEFAULT_FILTERS, opts: { draws?: number; seed?: number } = {}): Outcome {
  const { passed, excluded } = applyFilters(buildRows(ds), filters);
  return { filters, weights, passed: passed.length, excluded, ranked: rank(score(passed, weights)), sens: sensitivity(passed, weights, opts) };
}

const pct = (x: number | null, d = 0) => (x === null ? "n/a" : `${(x * 100).toFixed(d)}%`);

/** Plain-text screening memo built only from the outcome (no free text), so every sentence can be traced to a number. */
export function memo(o: Outcome, ds: Dataset, universeSize: number): string[] {
  const top = o.ranked.slice(0, 5);
  const lines: string[] = [];
  lines.push(`SCREENING MEMO (hypothetical buyer brief; preliminary screening only; data retrieved ${ds.generated}).`);
  lines.push(`Universe: ${universeSize} US-listed pharmaceutical and biotechnology companies chosen by the author (a convenience sample, not a systematic screen). Hard filters: FY2025 revenue between $${o.filters.minRevenue}m and $${o.filters.maxRevenue}m${o.filters.requireProfitable ? ", positive FY2025 operating income" : ""}, and complete core data. ${o.passed} companies passed; ${o.excluded.length} were excluded.`);
  if (!top.length) {
    lines.push("No company passes the current filters, so there is no shortlist. Relax a filter to continue.");
    return lines;
  }
  const w = o.weights;
  lines.push(`Weights: ${CRITERIA.map((c) => `${CRITERION_INFO[c].label} ${w[c]}`).join(", ")}.`);
  lines.push("Top candidates for further work:");
  top.forEach((t) => {
    const sc = t.s.row.scores;
    const strong = CRITERIA.filter((c) => sc[c] !== null && (sc[c] as number) >= 90).map((c) => CRITERION_INFO[c].label);
    const weak = CRITERIA.filter((c) => sc[c] !== null && (sc[c] as number) < 50).map((c) => CRITERION_INFO[c].label);
    const sn = o.sens.perTicker[t.ticker];
    const m = t.s.row.metrics;
    lines.push(`${t.rank}. ${t.s.row.name} (${t.ticker}): score ${t.s.score.toFixed(0)}/100; revenue $${(m.revenue ?? 0).toFixed(0)}m, operating margin ${pct(m.opMargin)}, revenue CAGR ${pct(m.revenueCagr)}. Strong (90+): ${strong.join(", ") || "none"}. Weak (below 50): ${weak.join(", ") || "none"}. Top five in ${(sn.top5Share * 100).toFixed(0)}% of ${o.sens.draws} perturbed weightings (rank ${sn.p5} to ${sn.p95}).${t.s.row.flags.length ? ` Data flags: ${t.s.row.flags.length}.` : ""}`);
  });
  const stable = o.ranked.filter((r) => o.sens.perTicker[r.ticker].top5Share >= 0.8).map((r) => r.ticker);
  lines.push(`Ranking stability: ${stable.length ? `${stable.join(", ")} stay in the top five in at least 80% of perturbed weightings.` : "no company stays in the top five in 80% of perturbed weightings, so the shortlist depends on the weights."}`);
  const flagged = top.filter((t) => t.s.row.flags.length).map((t) => t.ticker);
  if (flagged.length) lines.push(`Data gaps to resolve before any use: ${flagged.join(", ")} (see the flags in the table).`);
  lines.push("Not assessed: valuation or market capitalisation, ownership and control, product concentration and patent expiry, pipeline quality, litigation, financing, synergies, antitrust, and whether any company is for sale. The ranking says which companies fit a fundamentals-based brief, not that a deal is feasible or advisable.");
  return lines;
}
