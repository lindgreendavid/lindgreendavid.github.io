// Leveraged-buyout model. Pure functions, no I/O, so the page, the tests and the Excel check all use the same maths.
// Units: US dollars, millions. Five-year hold, annual periods. Educational; every rate and multiple is an input, not a market quote.
//
// Simplifications (stated on the page): interest is charged on opening balances (no circularity); one senior tranche with a cash sweep and one
// subordinated bullet tranche; no revolver (a funding gap is flagged, and its return is conditional on unmodelled financing); sponsor proceeds are floored at zero (limited liability); no minimum cash; no interest-deductibility limit; no management
// equity, dividends or purchase-price accounting; fees are expensed at close and not amortised.

export const HOLD_YEARS = 5;

export type LboInputs = {
  // starting point (from the filings)
  revenue0: number;
  ebitda0: number;
  daPct: number; // depreciation and amortisation, share of revenue
  netDebt0: number; // existing net debt, refinanced at close (informational: the purchase price is set on enterprise value)
  // deal
  entryMultiple: number; // enterprise value / LTM EBITDA
  exitMultiple: number;
  seniorX: number; // senior debt, multiples of LTM EBITDA
  subX: number; // subordinated debt, multiples of LTM EBITDA
  seniorRate: number;
  subRate: number;
  seniorAmortPct: number; // mandatory repayment per year, share of the original senior balance
  sweepPct: number; // share of excess cash used to repay senior debt
  feePct: number; // transaction and financing fees, share of enterprise value
  // operations
  growth: number[]; // revenue growth for each of the five years
  marginTarget: number; // EBITDA margin in year 5; moves in a straight line from the starting margin
  capexPct: number;
  nwcPct: number; // working-capital investment, share of the change in revenue
  taxRate: number;
};

export class LboInputError extends Error {}

export type Year = {
  year: number;
  revenue: number;
  ebitda: number;
  margin: number;
  da: number;
  ebit: number;
  interest: number;
  tax: number;
  capex: number;
  nwc: number;
  fcf: number; // after interest and tax, before debt repayment
  mandatory: number;
  sweep: number;
  senior: number;
  sub: number;
  cash: number;
  netDebt: number;
  leverage: number | null; // net debt / EBITDA
  coverage: number | null; // EBITDA / cash interest
};

export type LboResult = {
  ev0: number;
  fees: number;
  uses: number;
  senior0: number;
  sub0: number;
  sponsorEquity: number;
  equityPurchase: number; // enterprise value less existing net debt
  equityShare: number; // sponsor equity / total sources
  years: Year[];
  exitEv: number;
  exitNetDebt: number;
  exitEquity: number; // exit enterprise value less net debt; negative when the lenders are not repaid in full
  sponsorProceeds: number; // what the sponsor receives: exit equity, but never below zero (limited liability, no further support modelled)
  fundingGap: boolean; // cash goes negative in some year: an unspecified, uncosted source of funds is being assumed
  moic: number;
  irr: number;
  bridge: { ebitdaGrowth: number; multiple: number; deleveraging: number; fees: number; limitedLiability: number; total: number };
  flags: string[];
};

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function validateLbo(i: LboInputs): void {
  const num: (keyof LboInputs)[] = ["revenue0", "ebitda0", "daPct", "netDebt0", "entryMultiple", "exitMultiple", "seniorX", "subX", "seniorRate", "subRate", "seniorAmortPct", "sweepPct", "feePct", "marginTarget", "capexPct", "nwcPct", "taxRate"];
  for (const k of num) if (!finite(i[k])) throw new LboInputError(`${k} must be a number`);
  if (!Array.isArray(i.growth) || i.growth.length !== HOLD_YEARS || !i.growth.every(finite)) throw new LboInputError(`Give five growth rates, one for each year`);
  if (i.revenue0 <= 0) throw new LboInputError("Starting revenue must be positive");
  if (i.ebitda0 <= 0) throw new LboInputError("Starting EBITDA must be positive: a leveraged buyout is sized on cash earnings");
  if (i.entryMultiple <= 0 || i.exitMultiple <= 0) throw new LboInputError("Multiples must be positive");
  if (i.seniorX < 0 || i.subX < 0) throw new LboInputError("Debt multiples cannot be negative");
  if (i.seniorRate < 0 || i.subRate < 0 || i.seniorRate > 0.4 || i.subRate > 0.4) throw new LboInputError("Interest rates must be between 0% and 40%");
  if (i.seniorAmortPct < 0 || i.seniorAmortPct > 1) throw new LboInputError("Mandatory repayment must be between 0% and 100% a year");
  if (i.sweepPct < 0 || i.sweepPct > 1) throw new LboInputError("Cash sweep must be between 0% and 100%");
  if (i.feePct < 0 || i.feePct > 0.2) throw new LboInputError("Fees must be between 0% and 20% of enterprise value");
  if (i.growth.some((g) => g <= -1)) throw new LboInputError("Growth cannot be -100% or lower");
  if (i.marginTarget <= 0 || i.marginTarget >= 1) throw new LboInputError("The year-5 EBITDA margin must be between 0% and 100%");
  if (i.daPct < 0 || i.daPct >= 1 || i.capexPct < 0 || i.capexPct >= 1) throw new LboInputError("D&A and capex must be between 0% and 100% of revenue");
  if (i.nwcPct < -1 || i.nwcPct > 1) throw new LboInputError("Working-capital investment must be between -100% and 100% of the change in revenue");
  if (i.taxRate < 0 || i.taxRate >= 1) throw new LboInputError("Tax rate must be between 0% and 100%");
  const ev0 = i.entryMultiple * i.ebitda0;
  const debt0 = (i.seniorX + i.subX) * i.ebitda0;
  if (debt0 >= ev0 * (1 + i.feePct)) throw new LboInputError("The debt is as large as the whole price: there is no equity cheque. Lower the debt multiples or raise the entry multiple");
}

export function runLbo(i: LboInputs): LboResult {
  validateLbo(i);
  const ev0 = i.entryMultiple * i.ebitda0;
  const fees = i.feePct * ev0;
  const uses = ev0 + fees;
  const senior0 = i.seniorX * i.ebitda0;
  const sub0 = i.subX * i.ebitda0;
  const sponsorEquity = uses - senior0 - sub0;
  const margin0 = i.ebitda0 / i.revenue0;
  const flags: string[] = [];

  const years: Year[] = [];
  let rev = i.revenue0;
  let senior = senior0;
  let sub = sub0;
  let cash = 0;
  let gap = false;
  for (let t = 1; t <= HOLD_YEARS; t++) {
    const prev = rev;
    rev = prev * (1 + i.growth[t - 1]);
    const margin = margin0 + ((i.marginTarget - margin0) * t) / HOLD_YEARS;
    const ebitda = rev * margin;
    const da = rev * i.daPct;
    const ebit = ebitda - da;
    const interest = senior * i.seniorRate + sub * i.subRate; // opening balances
    const tax = Math.max(0, (ebit - interest) * i.taxRate);
    const capex = rev * i.capexPct;
    const nwc = (rev - prev) * i.nwcPct;
    const fcf = ebitda - interest - tax - capex - nwc;
    const mandatory = Math.min(senior, i.seniorAmortPct * senior0);
    const available = cash + fcf - mandatory;
    const sweep = Math.min(senior - mandatory, Math.max(0, i.sweepPct * available));
    senior = senior - mandatory - sweep;
    cash = available - sweep;
    if (cash < -1e-9) gap = true;
    const netDebt = senior + sub - cash;
    years.push({ year: t, revenue: rev, ebitda, margin, da, ebit, interest, tax, capex, nwc, fcf, mandatory, sweep, senior, sub, cash, netDebt, leverage: ebitda > 0 ? netDebt / ebitda : null, coverage: interest > 0 ? ebitda / interest : null });
  }
  const last = years[HOLD_YEARS - 1];
  const exitEv = i.exitMultiple * last.ebitda;
  const exitNetDebt = last.netDebt;
  const exitEquity = exitEv - exitNetDebt;
  const sponsorProceeds = Math.max(0, exitEquity);
  const moic = sponsorProceeds / sponsorEquity;
  const irr = moic > 0 ? Math.pow(moic, 1 / HOLD_YEARS) - 1 : -1;
  const bridge = {
    ebitdaGrowth: i.entryMultiple * (last.ebitda - i.ebitda0),
    multiple: (i.exitMultiple - i.entryMultiple) * last.ebitda,
    deleveraging: senior0 + sub0 - exitNetDebt,
    fees: -fees,
    limitedLiability: sponsorProceeds - exitEquity, // zero unless the equity is wiped out and the lenders bear the loss
    total: sponsorProceeds - sponsorEquity,
  };

  const totalX = i.seniorX + i.subX;
  if (totalX > 6) flags.push(`Total debt of ${totalX.toFixed(1)}x EBITDA is very high; lenders may not provide it for a company of this kind`);
  if (sponsorEquity / uses < 0.3) flags.push(`The equity cheque is only ${((sponsorEquity / uses) * 100).toFixed(0)}% of the total funding`);
  if (years[0].coverage !== null && years[0].coverage < 2) flags.push(`Year-1 EBITDA covers cash interest only ${years[0].coverage.toFixed(1)} times, which leaves little room for a bad year`);
  if (gap) flags.push("Cash flow after interest does not cover the mandatory repayments in at least one year: the model has no revolver, so this is a funding gap. The return shown assumes the shortfall is financed at no cost, so treat it as conditional, not as an outcome");
  if (ev0 - i.netDebt0 <= 0) flags.push("The entry price is below the company's existing net debt, so the equity purchase price would be zero or negative");
  if (exitEquity <= 0) flags.push("The sponsor equity is wiped out in this case");
  if (i.exitMultiple > i.entryMultiple) flags.push("The exit multiple is above the entry multiple: part of the return comes from selling at a higher multiple than was paid");
  if (last.cash > 0.5 * last.ebitda) flags.push("The senior debt is fully repaid and cash is building up unused; a real sponsor would pay a dividend or refinance");

  return { ev0, fees, uses, senior0, sub0, sponsorEquity, equityPurchase: ev0 - i.netDebt0, equityShare: sponsorEquity / uses, years, exitEv, exitNetDebt, exitEquity, sponsorProceeds, fundingGap: gap, moic, irr, bridge, flags };
}

/** IRR for a grid of two inputs. A cell is null where the inputs are not valid (for example no equity cheque). */
export function irrGrid(base: LboInputs, rowKey: "entryMultiple" | "seniorX", rows: number[], colKey: "exitMultiple" | "marginTarget", cols: number[]): (number | null)[][] {
  return rows.map((r) =>
    cols.map((c) => {
      try {
        return runLbo({ ...base, [rowKey]: r, [colKey]: c }).irr;
      } catch {
        return null;
      }
    }),
  );
}

/** Defaults for a target company, from its filings. Rates, multiples and operating assumptions are illustrative choices, not market data. */
export const DEFAULT_ASSUMPTIONS = {
  entryMultiple: 10,
  exitMultiple: 10,
  seniorX: 3.5,
  subX: 1.5,
  seniorRate: 0.08,
  subRate: 0.11,
  seniorAmortPct: 0.01,
  sweepPct: 1,
  feePct: 0.025,
  growth: [0.05, 0.05, 0.05, 0.05, 0.05],
  capexPct: 0.03,
  nwcPct: 0.1,
  taxRate: 0.21,
};

export function inputsFor(t: { revenue: number; ebitda: number; da: number; netDebt: number }, a: Partial<typeof DEFAULT_ASSUMPTIONS & { marginTarget: number }> = {}): LboInputs {
  const d = { ...DEFAULT_ASSUMPTIONS, ...a };
  return {
    revenue0: t.revenue,
    ebitda0: t.ebitda,
    daPct: t.da / t.revenue,
    netDebt0: t.netDebt,
    ...d,
    marginTarget: a.marginTarget ?? t.ebitda / t.revenue,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Uncertainty: a seeded Monte Carlo of the return and a one-at-a-time (tornado) sensitivity. The ranges are illustrative assumptions chosen to
// show how wide the outcome can be; they are not estimated from data. Entry price, debt multiples and fees are held fixed (they are deal terms).
import { quantile, sampler } from "../stats.ts";

export const MC_SPREAD = { growthShift: 0.03, growthYearNoise: 0.02, marginSd: 0.03, exitHalfRange: 2, rateSd: 0.01 };

export type McResult = { draws: number; fundedDraws: number; probGap: number; seed: number; p5: number; p25: number; p50: number; p75: number; p95: number; probLoss: number; probBelow10: number; probAbove20: number; moicMedian: number; hist: { lo: number; hi: number; count: number }[] };

/** Monte Carlo of the IRR. Revenue growth shifts together (common shock plus year noise), the year-5 margin, the exit multiple (triangular) and the senior rate vary. `scale` 0 gives the base case on every draw. */
export function monteCarlo(base: LboInputs, o: { draws?: number; seed?: number; scale?: number } = {}): McResult {
  const draws = o.draws ?? 5000;
  const seed = o.seed ?? 1;
  const k = o.scale ?? 1;
  const s = sampler(seed);
  const all: number[] = [];
  const irrs: number[] = [];
  const moics: number[] = [];
  let gaps = 0;
  // The clamps keep draws in a plausible range but never exclude the base value itself, so zero spread reproduces the base case for any valid input.
  const gLo = Math.min(-0.5, ...base.growth);
  const mLo = Math.min(0.02, base.marginTarget);
  const mHi = Math.max(0.95, base.marginTarget);
  const xLo = Math.min(1, base.exitMultiple);
  for (let d = 0; d < draws; d++) {
    const shift = k * MC_SPREAD.growthShift * s.normal();
    const growth = base.growth.map((g) => Math.max(Math.min(-0.5, g), g + shift + k * MC_SPREAD.growthYearNoise * s.normal()));
    const margin = Math.min(mHi, Math.max(mLo, base.marginTarget + k * MC_SPREAD.marginSd * s.normal()));
    const r = k * MC_SPREAD.exitHalfRange;
    const exit = r === 0 ? base.exitMultiple : Math.max(xLo, s.triangular(base.exitMultiple - r, base.exitMultiple, base.exitMultiple + r));
    const rate = Math.max(0, base.seniorRate + k * MC_SPREAD.rateSd * s.normal());
    const res = runLbo({ ...base, growth, marginTarget: margin, exitMultiple: exit, seniorRate: rate });
    all.push(res.irr);
    if (res.fundingGap) gaps++;
    else {
      irrs.push(res.irr);
      moics.push(res.moic);
    }
  }
  // Cases with a funding gap are reported separately: their return depends on financing the model does not specify. If every case has one, the summary falls back to all of them.
  const funded = irrs.length;
  if (funded === 0) {
    irrs.push(...all);
    moics.push(...all.map(() => Number.NaN));
  }
  const n = irrs.length;
  const sorted = [...irrs].sort((a, b) => a - b);
  const ms = [...moics].sort((a, b) => a - b);
  const lo = Math.max(-1, Math.floor(quantile(sorted, 0.01) * 50) / 50);
  const hi = Math.ceil(quantile(sorted, 0.99) * 50) / 50;
  const bins = 16;
  const w = (hi - lo) / bins || 0.01;
  const hist = Array.from({ length: bins }, (_, i) => ({ lo: lo + i * w, hi: lo + (i + 1) * w, count: 0 }));
  for (const v of irrs) hist[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)))].count++;
  const frac = (f: (x: number) => boolean) => irrs.filter(f).length / n;
  return { draws, fundedDraws: funded, probGap: gaps / draws, seed, p5: quantile(sorted, 0.05), p25: quantile(sorted, 0.25), p50: quantile(sorted, 0.5), p75: quantile(sorted, 0.75), p95: quantile(sorted, 0.95), probLoss: frac((x) => x < 0), probBelow10: frac((x) => x < 0.1), probAbove20: frac((x) => x >= 0.2), moicMedian: funded === 0 ? Number.NaN : quantile(ms, 0.5), hist };
}

export type TornadoRow = { driver: string; low: number | null; high: number | null; lowLabel: string; highLabel: string; swing: number };

/** One-at-a-time: each driver moved down and up by a stated amount with everything else at base. Sorted by the size of the swing in IRR. */
export function tornado(base: LboInputs): { base: number; rows: TornadoRow[] } {
  const irr = (o: Partial<LboInputs>) => {
    try {
      return runLbo({ ...base, ...o }).irr;
    } catch {
      return null;
    }
  };
  const b = runLbo(base).irr;
  const pp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(0)} pts`;
  const defs: { driver: string; lowLabel: string; highLabel: string; low: Partial<LboInputs>; high: Partial<LboInputs> }[] = [
    { driver: "Exit multiple", lowLabel: "−2x", highLabel: "+2x", low: { exitMultiple: Math.max(Math.min(1, base.exitMultiple), base.exitMultiple - 2) }, high: { exitMultiple: base.exitMultiple + 2 } },
    { driver: "Year-5 EBITDA margin", lowLabel: pp(-0.03), highLabel: pp(0.03), low: { marginTarget: Math.max(Math.min(0.02, base.marginTarget), base.marginTarget - 0.03) }, high: { marginTarget: Math.min(Math.max(0.95, base.marginTarget), base.marginTarget + 0.03) } },
    { driver: "Revenue growth, every year", lowLabel: pp(-0.03), highLabel: pp(0.03), low: { growth: base.growth.map((g) => g - 0.03) }, high: { growth: base.growth.map((g) => g + 0.03) } },
    { driver: "Senior debt multiple", lowLabel: "−1x", highLabel: "+1x", low: { seniorX: Math.max(0, base.seniorX - 1) }, high: { seniorX: base.seniorX + 1 } },
    { driver: "Senior interest rate", lowLabel: pp(-0.02), highLabel: pp(0.02), low: { seniorRate: Math.max(0, base.seniorRate - 0.02) }, high: { seniorRate: base.seniorRate + 0.02 } },
    { driver: "Capex, share of revenue", lowLabel: pp(-0.01), highLabel: pp(0.01), low: { capexPct: Math.max(0, base.capexPct - 0.01) }, high: { capexPct: base.capexPct + 0.01 } },
    { driver: "Tax rate", lowLabel: pp(-0.05), highLabel: pp(0.05), low: { taxRate: Math.max(0, base.taxRate - 0.05) }, high: { taxRate: Math.min(0.9, base.taxRate + 0.05) } },
  ];
  const rows = defs.map((d) => {
    const a = irr(d.low);
    const c = irr(d.high);
    const vals = [a, c].filter((x): x is number => x !== null);
    // low and high are the worse and the better IRR of the two moves, so the bar always runs from the lower to the higher return
    const lo = vals.length ? Math.min(...vals) : null;
    const hi = vals.length ? Math.max(...vals) : null;
    return { driver: d.driver, low: lo, high: hi, lowLabel: d.lowLabel, highLabel: d.highLabel, swing: lo !== null && hi !== null ? hi - lo : 0 };
  });
  rows.sort((x, y) => y.swing - x.swing);
  return { base: b, rows };
}
