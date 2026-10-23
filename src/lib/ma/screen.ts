// Screening model for the Strategic M&A Screening Workbench. Pure functions: no DOM, no I/O, so everything is testable in Node.
// It ranks companies against a HYPOTHETICAL buyer brief using public fundamentals. It is a screening aid only:
// no synergies, no financing, no accretion or LBO maths, and no view on whether a deal is feasible. Market prices are never bundled:
// the optional valuation criteria use prices the USER enters (price x cover-page share count), in the browser only.

export type Cell = { value: number; tag: string; accn: string; filed: string; end: string; note?: string } | null;
export type YearData = Record<"revenue" | "operating_income" | "net_income" | "rnd" | "cfo" | "da" | "cash" | "debt" | "st_investments" | "assets", Cell>;
export type Company = { ticker: string; name: string; sic: string; sicDescription: string; fiscalYearEnd: string; shares?: { value: number; end: string; accn: string; filed: string; classes: number; note?: string }; debtLikeItems?: { label: string; value: number }[]; docChecked?: boolean; years: Record<string, YearData> };
export type Dataset = { generated: string; companies: Record<string, Company> };

export const CRITERIA = ["scale", "growth", "margin", "cash", "leverage", "rnd", "value", "capacity"] as const;
export type Criterion = (typeof CRITERIA)[number];
export type Weights = Record<Criterion, number>;

export const CRITERION_INFO: Record<Criterion, { label: string; measure: string; anchors: string }> = {
  scale: { label: "Scale fit", measure: "FY2025 revenue", anchors: "0 at $150m, 100 from $300m to $1,500m, back to 0 at $3,000m" },
  growth: { label: "Growth", measure: "Revenue CAGR FY2022 to FY2025", anchors: "0 at 0% or below, 100 at 30% or more" },
  margin: { label: "Profitability", measure: "FY2025 operating margin", anchors: "0 at 0% or below, 100 at 40% or more" },
  cash: { label: "Cash generation", measure: "FY2025 operating cash flow / revenue", anchors: "0 at 0% or below, 100 at 35% or more" },
  leverage: { label: "Balance sheet", measure: "FY2025 net debt / EBITDA", anchors: "100 at net cash, 0 at 4.0x or more" },
  rnd: { label: "R&D reinvestment", measure: "FY2025 R&D / revenue", anchors: "0 at 0%, 100 from 10% to 30%, back to 0 at 60%" },
  value: { label: "Valuation (needs your prices)", measure: "Enterprise value / FY2025 EBITDA", anchors: "100 at 8x or less, 0 at 25x or more; 0 if EBITDA is not positive" },
  capacity: { label: "Deal size (needs your prices)", measure: "Enterprise value in dollars", anchors: "0 at $300m, 100 from $1,000m to $6,000m, back to 0 at $12,000m" },
};

/** The two market criteria start at 0 because no prices are bundled; they switch on when the user enters prices. */
export const DEFAULT_WEIGHTS: Weights = { scale: 15, growth: 25, margin: 25, cash: 15, leverage: 10, rnd: 10, value: 0, capacity: 0 };
export const MARKET_WEIGHTS_ON: Pick<Weights, "value" | "capacity"> = { value: 10, capacity: 10 };

export type Filters = { minRevenue: number; maxRevenue: number; requireProfitable: boolean };
export const DEFAULT_FILTERS: Filters = { minRevenue: 150, maxRevenue: 3000, requireProfitable: true };

export type Policy = "renormalize" | "zero";

/** Royalty-financing obligations (sold future royalties) are debt-like; counting them is the default and can be switched off. `prices` are user-entered, US dollars per share. */
export type Options = { includeRoyalty: boolean; prices?: Record<string, number> };
export const DEFAULT_OPTIONS: Options = { includeRoyalty: true };

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
  debtLike: number;
  price: number | null;
  marketCap: number | null;
  ev: number | null;
  evToEbitda: number | "n/m" | null;
  evToRevenue: number | null;
};

const v = (c: Cell | undefined) => (c ? c.value : null);

export function metricsFor(c: Company, opts: Options = DEFAULT_OPTIONS): { m: Metrics; flags: string[]; missing: Criterion[] } {
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
  if (debt !== null && y25.debt?.note?.startsWith("read from the 10-K")) flags.push("Debt read from the 10-K balance sheet text (the standard XBRL tags did not carry it)");
  if (da === null) flags.push("Depreciation and amortisation not found: EBITDA is unavailable unless the company is in net cash");
  if (cash === null) flags.push("Cash balance not found");
  if (inv === null) flags.push("No short-term investments found: net debt deducts cash only, so liquidity may be understated");
  if (c.fiscalYearEnd !== "1231") flags.push("52/53-week fiscal year: periods end near, not on, 31 December");
  for (const y of [2022, 2023, 2024, 2025] as const) {
    for (const cell of Object.values(c.years[String(y)] ?? {})) if (cell?.note) { flags.push(`Different tag used in some year (${cell.note})`); break; }
  }

  const debtLike = (c.debtLikeItems ?? []).reduce((acc, i) => acc + i.value, 0);
  if (debtLike > 0) flags.push(`Royalty-financing obligations of $${debtLike.toFixed(0)}m (sold future royalties) are ${opts.includeRoyalty ? "counted as debt" : "NOT counted as debt"} in net debt; they are repaid from royalty income and are often non-recourse`);
  if (c.docChecked === false) flags.push("The 10-K text was not checked for debt-like obligations");
  if (rev && op !== null && op / rev >= 0.4) flags.push("Operating margin of 40% or more: check the filing for one-off items such as licence or milestone revenue");
  if (revenueCagr !== null && revenueCagr >= 0.4) flags.push("Revenue CAGR of 40% or more: check for one-off revenue and acquisitions");
  if (!c.shares) flags.push("No cover-page share count found: market capitalisation cannot be computed");
  if (c.shares && c.shares.classes > 1) flags.push("Several share classes were summed from the cover page");

  const netDebt = debt !== null && cash !== null ? debt + (opts.includeRoyalty ? debtLike : 0) - cash - (inv ?? 0) : null;
  const ebitda = op !== null && da !== null ? op + da : null;
  let leverage: Metrics["leverage"] = null;
  if (netDebt !== null) {
    if (netDebt <= 0) leverage = "net cash";
    else if (ebitda !== null) leverage = ebitda > 0 ? netDebt / ebitda : "n/m";
  }
  const price = opts.prices?.[c.ticker] ?? null;
  const marketCap = price !== null && c.shares ? price * c.shares.value : null;
  const ev = marketCap !== null && netDebt !== null ? marketCap + netDebt : null;
  if (ev !== null && ev <= 0) flags.push("Net cash exceeds the market value entered: check the price");
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
    debtLike,
    price,
    marketCap,
    ev,
    evToEbitda: ev === null ? null : ebitda === null ? null : ebitda > 0 ? ev / ebitda : "n/m",
    evToRevenue: ev !== null && rev ? ev / rev : null,
  };
  const missing: Criterion[] = [];
  if (m.revenue === null) missing.push("scale");
  if (m.revenueCagr === null) missing.push("growth");
  if (m.opMargin === null) missing.push("margin");
  if (m.cfoMargin === null) missing.push("cash");
  if (m.leverage === null) missing.push("leverage");
  if (m.rndIntensity === null) missing.push("rnd");
  // The market criteria are only "missing" when the user has entered prices at all.
  if (opts.prices) {
    if (m.evToEbitda === null) missing.push("value");
    if (m.ev === null) missing.push("capacity");
  }
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
    value: m.evToEbitda === null ? null : m.evToEbitda === "n/m" ? 0 : interp(m.evToEbitda, [[8, 100], [25, 0]]),
    capacity: m.ev === null ? null : interp(m.ev, [[300, 0], [1000, 100], [6000, 100], [12000, 0]]),
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

export function buildRows(ds: Dataset, opts: Options = DEFAULT_OPTIONS): Row[] {
  return Object.values(ds.companies).map((c) => {
    const { m, flags, missing } = metricsFor(c, opts);
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
  options: Options;
  /** Set when the user entered prices: how many companies have one and the date the user gave. */
  market?: { count: number; date: string };
};

export function run(ds: Dataset, weights: Weights = DEFAULT_WEIGHTS, filters: Filters = DEFAULT_FILTERS, sim: { draws?: number; seed?: number } = {}, options: Options = DEFAULT_OPTIONS, marketDate = ""): Outcome {
  const { passed, excluded } = applyFilters(buildRows(ds, options), filters);
  const count = options.prices ? Object.keys(options.prices).length : 0;
  return { filters, weights, passed: passed.length, excluded, ranked: rank(score(passed, weights)), sens: sensitivity(passed, weights, sim), options, ...(count ? { market: { count, date: marketDate } } : {}) };
}

/**
 * Parses pasted "TICKER price" lines (separators: space, tab, comma, colon or semicolon; a leading $ is ignored; '#' starts a comment).
 * Only tickers in `known` are accepted; everything else is reported so nothing is silently dropped.
 */
export function parsePrices(text: string, known: string[]): { prices: Record<string, number>; errors: string[] } {
  const prices: Record<string, number> = {};
  const errors: string[] = [];
  const ok = new Set(known.map((k) => k.toUpperCase()));
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, "").replace(/(\d),(?=\d{3}(?!\d))/g, "$1").trim();
    if (!line) return;
    const parts = line.split(/[\s,;:]+/).filter(Boolean);
    const ticker = parts[0]?.toUpperCase();
    const price = Number((parts[1] ?? "").replace(/^\$/, "").replace(/,(\d{3})/g, "$1"));
    if (parts.length < 2 || !Number.isFinite(price) || price <= 0) errors.push(`Line ${i + 1} ("${raw.trim().slice(0, 40)}"): expected a ticker and a positive price`);
    else if (!ok.has(ticker)) errors.push(`Line ${i + 1}: ${ticker} is not one of the ${known.length} companies`);
    else prices[ticker] = price;
  });
  return { prices, errors };
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
  const active = CRITERIA.filter((c) => w[c] > 0);
  const usesMarket = (w.value > 0 || w.capacity > 0) && !!o.market;
  lines.push(`Weights: ${active.map((c) => `${CRITERION_INFO[c].label} ${w[c]}`).join(", ")}.`);
  lines.push(`Net debt ${o.options.includeRoyalty ? "counts" : "does not count"} royalty-financing obligations (sold future royalties) as debt.`);
  if (usesMarket) lines.push(`Valuation and deal-size criteria use share prices entered by the user for ${o.market!.count} companies${o.market!.date ? ` (dated ${o.market!.date})` : " (no date given)"}, multiplied by the share count on each 10-K cover page. No prices are bundled with this tool, and companies without a price are flagged and handled by the missing-data policy.`);
  lines.push("Top candidates for further work:");
  top.forEach((t) => {
    const sc = t.s.row.scores;
    const strong = active.filter((c) => sc[c] !== null && (sc[c] as number) >= 90).map((c) => CRITERION_INFO[c].label);
    const weak = active.filter((c) => sc[c] !== null && (sc[c] as number) < 50).map((c) => CRITERION_INFO[c].label);
    const sn = o.sens.perTicker[t.ticker];
    const m = t.s.row.metrics;
    lines.push(`${t.rank}. ${t.s.row.name} (${t.ticker}): score ${t.s.score.toFixed(0)}/100; revenue $${(m.revenue ?? 0).toFixed(0)}m, operating margin ${pct(m.opMargin)}, revenue CAGR ${pct(m.revenueCagr)}${usesMarket && m.ev !== null ? `, enterprise value $${m.ev.toFixed(0)}m${typeof m.evToEbitda === "number" ? ` (${m.evToEbitda.toFixed(1)}x EBITDA)` : ""}` : ""}. Strong (90+): ${strong.join(", ") || "none"}. Weak (below 50): ${weak.join(", ") || "none"}. Top five in ${(sn.top5Share * 100).toFixed(0)}% of ${o.sens.draws} perturbed weightings (rank ${sn.p5} to ${sn.p95}).${t.s.row.flags.length ? ` Data flags: ${t.s.row.flags.length}.` : ""}`);
  });
  const stable = o.ranked.filter((r) => o.sens.perTicker[r.ticker].top5Share >= 0.8).map((r) => r.ticker);
  lines.push(`Ranking stability: ${stable.length ? `${stable.join(", ")} stay in the top five in at least 80% of perturbed weightings.` : "no company stays in the top five in 80% of perturbed weightings, so the shortlist depends on the weights."}`);
  const flagged = top.filter((t) => t.s.row.flags.length).map((t) => t.ticker);
  if (flagged.length) lines.push(`Data gaps to resolve before any use: ${flagged.join(", ")} (see the flags in the table).`);
  lines.push(`Not assessed: ${usesMarket ? "control premium and deal terms, " : "valuation or market capitalisation, "}ownership and control, product concentration and patent expiry, pipeline quality, litigation, financing, synergies, antitrust, and whether any company is for sale. The ranking says which companies fit a fundamentals-based brief, not that a deal is feasible or advisable.`);
  return lines;
}

// ---- does the shortlist survive a different brief? ----

export type Brief = { id: string; name: string; summary: string; weights: Weights; filters: Filters };

const W = (o: Partial<Weights>): Weights => ({ scale: 0, growth: 0, margin: 0, cash: 0, leverage: 0, rnd: 0, value: 0, capacity: 0, ...o });

/** Three hypothetical briefs written by the author. They differ in weights and filters only, so they test the weights, not the criteria. */
export const BRIEFS: Brief[] = [
  { id: "A", name: "BuyerCo (the default brief)", summary: "Balanced: growth and profitability first, profitable companies only, revenue $150m to $3bn.", weights: DEFAULT_WEIGHTS, filters: DEFAULT_FILTERS },
  { id: "B", name: "GrowthCo", summary: "Pays for momentum: growth 40, R&D reinvestment 20, no profit filter, revenue $100m to $5bn.", weights: W({ scale: 10, growth: 40, margin: 10, cash: 10, leverage: 10, rnd: 20 }), filters: { minRevenue: 100, maxRevenue: 5000, requireProfitable: false } },
  { id: "C", name: "IncomeCo", summary: "Wants cash yield and a clean balance sheet: margin 30, cash 30, balance sheet 25, little growth weight.", weights: W({ scale: 10, growth: 5, margin: 30, cash: 30, leverage: 25 }), filters: DEFAULT_FILTERS },
];

export type BriefResult = { brief: Brief; passed: number; top: { ticker: string; name: string; rank: number; score: number }[] };

export function compareBriefs(ds: Dataset, options: Options = DEFAULT_OPTIONS, n = 5): { results: BriefResult[]; inAll: string[]; inMajority: string[] } {
  const rows = buildRows(ds, options);
  const results = BRIEFS.map((b) => {
    const { passed } = applyFilters(rows, b.filters);
    const ranked = rank(score(passed, b.weights));
    return { brief: b, passed: passed.length, top: ranked.slice(0, n).map((r) => ({ ticker: r.ticker, name: r.s.row.name, rank: r.rank, score: r.s.score })) };
  });
  const count: Record<string, number> = {};
  for (const r of results) for (const t of r.top) count[t.ticker] = (count[t.ticker] ?? 0) + 1;
  const inAll = Object.entries(count).filter(([, c]) => c === results.length).map(([t]) => t);
  const inMajority = Object.entries(count).filter(([, c]) => c >= 2 && c < results.length).map(([t]) => t);
  return { results, inAll, inMajority };
}
