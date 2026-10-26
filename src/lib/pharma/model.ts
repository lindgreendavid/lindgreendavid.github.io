// Pure functions for the Pharma Valuation Explorer: comparable metrics, enterprise value, multiples and a DCF.
// No DOM and no I/O: the dataset is passed in, so every function can be tested in Node.
// All money is in millions. "usd" mode translates with ECB reference rates; "local" keeps the reporting currency.

export const YEARS = [2023, 2024, 2025] as const;
export type Year = (typeof YEARS)[number];
export type Mode = "usd" | "local";

type Cell = { value: number };
export type Dataset = {
  companies: Record<string, { name: string; currency: string; years: Record<string, Record<string, Cell>> }>;
  fx: { usdPerEurAvg: Record<string, number>; usdPerEurEnd: Record<string, number>; usdPerGbpAvg: Record<string, number>; usdPerGbpEnd: Record<string, number> };
};

/** Multiplier that converts a reported amount to US dollars. Flows use the annual average, balances the year-end rate. */
export function toUsdRate(ds: Dataset, company: string, year: number, kind: "flow" | "balance"): number {
  const cur = ds.companies[company].currency;
  if (cur === "USD") return 1;
  if (cur === "GBP") return (kind === "flow" ? ds.fx.usdPerGbpAvg : ds.fx.usdPerGbpEnd)[String(year)];
  if (cur === "EUR") return (kind === "flow" ? ds.fx.usdPerEurAvg : ds.fx.usdPerEurEnd)[String(year)];
  throw new Error(`No FX rule for currency ${cur}`);
}

const BALANCE = new Set(["cash", "liquid_investments", "debt_financial", "lease_liabilities", "borrowings_incl_leases", "nci_book", "equity_total", "pension_liability", "shares_outstanding_m"]);

/** A reported line in the requested currency. Share counts are never translated. */
export function line(ds: Dataset, company: string, year: number, metric: string, mode: Mode = "usd"): number | undefined {
  const cell = ds.companies[company].years[String(year)]?.[metric];
  if (!cell) return undefined;
  if (mode === "local" || metric === "shares_outstanding_m") return cell.value;
  return cell.value * toUsdRate(ds, company, year, BALANCE.has(metric) ? "balance" : "flow");
}

export type Comparable = {
  revenue: number;
  revenueGrowth?: number;
  operatingProfit: number;
  operatingMargin: number;
  profit: number;
  profitMargin: number;
  rndIntensity: number;
  cfo: number;
  capex: number;
  intangiblePurchases: number;
  /** Operating cash flow less purchases of property, plant and equipment. */
  fcfPpe: number;
  /** As fcfPpe, also less purchases of intangible assets (includes acquired licences and rights). */
  fcfAfterIntangibles: number;
  cashConversion: number;
  cash: number;
  /** Financial debt including lease liabilities. */
  debtInclLeases: number;
  /** Debt incl. leases less cash and, where reported, liquid investments. */
  netDebt: number;
  effectiveTaxRate: number;
};

export function comparable(ds: Dataset, company: string, year: Year, mode: Mode = "usd"): Comparable {
  const g = (m: string) => line(ds, company, year, m, mode);
  const need = (m: string) => {
    const v = g(m);
    if (v === undefined) throw new Error(`${company} ${year}: ${m} missing`);
    return v;
  };
  const revenue = need("revenue");
  const prev = year > 2023 ? line(ds, company, year - 1, "revenue", mode) : undefined;
  const op = need("operating_profit");
  const profit = need("profit_continuing");
  const cfo = need("cfo");
  const capex = need("capex_ppe");
  const intang = need("capex_intangibles");
  const cash = need("cash");
  const leases = g("lease_liabilities");
  // AstraZeneca stores borrowings including leases; Novartis stores debt and leases separately; GSK's borrowings already include leases.
  const debt = g("borrowings_incl_leases") ?? need("debt_financial") + (leases ?? 0);
  const liquid = g("liquid_investments") ?? 0;
  return {
    revenue,
    revenueGrowth: prev ? revenue / prev - 1 : undefined,
    operatingProfit: op,
    operatingMargin: op / revenue,
    profit,
    profitMargin: profit / revenue,
    rndIntensity: need("rnd") / revenue,
    cfo,
    capex,
    intangiblePurchases: intang,
    fcfPpe: cfo - capex,
    fcfAfterIntangibles: cfo - capex - intang,
    cashConversion: cfo / profit,
    cash,
    debtInclLeases: debt,
    netDebt: debt - cash - liquid,
    effectiveTaxRate: need("income_tax") / need("pretax_profit"),
  };
}

export type Multiples = { marketCap: number; enterpriseValue: number; evToRevenue: number; evToOperatingProfit: number; priceToEarnings: number; fcfYield: number; ncIncluded: boolean };

/**
 * Enterprise value from a user-entered market capitalisation (USD millions) and the latest balance sheet.
 * EV = market cap + debt incl. leases - cash - liquid investments + non-controlling interests at BOOK value.
 * Book NCI understates the claim when NCI earns a large share of profit (GSK); callers should show that caveat.
 */
export function multiples(ds: Dataset, company: string, marketCapUsd: number, year: Year = 2025): Multiples {
  const c = comparable(ds, company, year, "usd");
  const nci = line(ds, company, year, "nci_book", "usd") ?? 0;
  const nciProfit = line(ds, company, year, "nci_profit", "usd") ?? 0;
  const ev = marketCapUsd + c.netDebt + nci;
  const earningsToOwners = c.profit - nciProfit;
  return {
    marketCap: marketCapUsd,
    enterpriseValue: ev,
    evToRevenue: ev / c.revenue,
    evToOperatingProfit: ev / c.operatingProfit,
    priceToEarnings: marketCapUsd / earningsToOwners,
    fcfYield: c.fcfAfterIntangibles / marketCapUsd,
    ncIncluded: nci !== 0,
  };
}

// ---------------------------------------------------------------- DCF

export type DcfInputs = {
  baseRevenue: number;
  baseOperatingMargin: number;
  /** Revenue growth for each forecast year (length = forecast years). */
  growth: number[];
  /** Operating margin reached in the last forecast year; the path from the base margin is linear. */
  targetMargin: number;
  taxRate: number;
  /** Depreciation and amortisation, % of revenue. */
  daPct: number;
  /** Purchases of PP&E plus intangible assets, % of revenue. */
  capexPct: number;
  /** Investment in working capital, % of revenue. */
  nwcPct: number;
  wacc: number;
  terminalGrowth: number;
  bridge: {
    debtInclLeases: number;
    cash: number;
    equityMethodInvestments: number;
    pensionDeficit: number;
    nonControllingInterests: number;
  };
  sharesMillions: number;
};

export type DcfYear = { year: number; revenue: number; operatingProfit: number; nopat: number; da: number; capex: number; nwc: number; fcff: number; discountFactor: number; pv: number };
export type DcfResult = {
  years: DcfYear[];
  sumPvFcff: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  terminalShareOfEv: number;
  equityValue: number;
  valuePerShare: number;
  impliedEvToBaseRevenue: number;
  bridge: { label: string; amount: number }[];
};

export class DcfInputError extends Error {}

const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * Domain checks for DCF inputs. Returns a plain-language message for the first problem, or null if the inputs can be valued.
 * Legitimate cases stay valid: negative growth, margins below the base margin, and a working-capital release (negative nwcPct).
 */
export function validateDcfInputs(i: DcfInputs): string | null {
  if (!Array.isArray(i.growth) || i.growth.length < 1) return "The forecast needs at least one year of revenue growth.";
  if (i.growth.length > 20) return "The forecast can have at most 20 years.";
  if (i.growth.some((g) => !fin(g))) return "Every year of revenue growth needs a number.";
  if (i.growth.some((g) => g <= -1)) return "Revenue growth cannot be -100% or lower.";
  if (!fin(i.baseRevenue) || i.baseRevenue <= 0) return "Base revenue must be a positive number.";
  if (!fin(i.baseOperatingMargin) || !fin(i.targetMargin)) return "Operating margins need to be numbers.";
  if (i.targetMargin >= 1) return "The target operating margin must be below 100%.";
  if (!fin(i.taxRate) || i.taxRate < 0 || i.taxRate >= 1) return "The tax rate must be between 0% and 100%.";
  for (const [name, v] of [["D&A", i.daPct], ["Capex", i.capexPct], ["Working-capital investment", i.nwcPct]] as const) {
    if (!fin(v)) return `${name} needs a number.`;
    if (Math.abs(v) >= 1) return `${name} as a share of revenue must be between -100% and 100%.`;
  }
  if (!fin(i.wacc) || i.wacc <= 0) return "The discount rate (WACC) must be a positive number.";
  if (i.wacc >= 1) return "The discount rate (WACC) must be below 100%.";
  if (!fin(i.terminalGrowth)) return "Terminal growth needs a number.";
  if (i.wacc <= i.terminalGrowth) return "The discount rate (WACC) must be higher than terminal growth, otherwise the terminal value is not defined.";
  const b = i.bridge;
  if (!b || [b.debtInclLeases, b.cash, b.equityMethodInvestments, b.pensionDeficit, b.nonControllingInterests].some((x) => !fin(x))) return "Every enterprise-to-equity bridge item needs a number.";
  if (!fin(i.sharesMillions) || i.sharesMillions <= 0) return "The share count must be a positive number.";
  return null;
}

export function runDcf(i: DcfInputs, baseYear = 2025): DcfResult {
  const problem = validateDcfInputs(i);
  if (problem) throw new DcfInputError(problem);
  const n = i.growth.length;
  const years: DcfYear[] = [];
  let revenue = i.baseRevenue;
  for (let t = 1; t <= n; t++) {
    revenue *= 1 + i.growth[t - 1];
    const margin = i.baseOperatingMargin + ((i.targetMargin - i.baseOperatingMargin) * t) / n;
    const ebit = revenue * margin;
    const nopat = ebit * (1 - i.taxRate);
    const da = revenue * i.daPct;
    const capex = revenue * i.capexPct;
    const nwc = revenue * i.nwcPct;
    const fcff = nopat + da - capex - nwc;
    const df = 1 / Math.pow(1 + i.wacc, t);
    years.push({ year: baseYear + t, revenue, operatingProfit: ebit, nopat, da, capex, nwc, fcff, discountFactor: df, pv: fcff * df });
  }
  const sumPv = years.reduce((s, y) => s + y.pv, 0);
  const last = years[n - 1];
  const tv = (last.fcff * (1 + i.terminalGrowth)) / (i.wacc - i.terminalGrowth);
  const pvTv = tv * last.discountFactor;
  const ev = sumPv + pvTv;
  if (!fin(ev) || !fin(tv)) throw new DcfInputError("These inputs produce a value that cannot be computed. Check the assumptions.");
  const b = i.bridge;
  const equity = ev - b.debtInclLeases + b.cash + b.equityMethodInvestments - b.pensionDeficit - b.nonControllingInterests;
  return {
    years,
    sumPvFcff: sumPv,
    terminalValue: tv,
    pvTerminalValue: pvTv,
    enterpriseValue: ev,
    terminalShareOfEv: pvTv / ev,
    equityValue: equity,
    valuePerShare: equity / i.sharesMillions,
    impliedEvToBaseRevenue: ev / i.baseRevenue,
    bridge: [
      { label: "Enterprise value", amount: ev },
      { label: "Less: debt including leases", amount: -b.debtInclLeases },
      { label: "Plus: cash and cash equivalents", amount: b.cash },
      { label: "Plus: equity-accounted investments (book)", amount: b.equityMethodInvestments },
      { label: "Less: pension deficit (pre-tax)", amount: -b.pensionDeficit },
      { label: "Less: non-controlling interests (book)", amount: -b.nonControllingInterests },
      { label: "Equity value", amount: equity },
    ],
  };
}

export type WaccInputs = { rf: number; erp: number; unlevBeta: number; de: number; tax: number; spread: number };
export type WaccResult = { levBeta: number; costOfEquity: number; preTaxCostOfDebt: number; afterTaxCostOfDebt: number; debtWeight: number; equityWeight: number; wacc: number };

/** CAPM cost of equity with a relevered beta, blended with an after-tax cost of debt (risk-free rate plus a credit spread). */
export function waccFromInputs(i: WaccInputs): WaccResult {
  for (const [k, v] of Object.entries(i)) if (!Number.isFinite(v)) throw new DcfInputError(`WACC input ${k} needs a number.`);
  if (i.de < 0 || i.tax < 0 || i.tax >= 1 || i.unlevBeta <= 0) throw new DcfInputError("WACC inputs are out of range.");
  const levBeta = i.unlevBeta * (1 + (1 - i.tax) * i.de);
  const costOfEquity = i.rf + levBeta * i.erp;
  const preTaxCostOfDebt = i.rf + i.spread;
  const afterTaxCostOfDebt = preTaxCostOfDebt * (1 - i.tax);
  const debtWeight = i.de / (1 + i.de);
  const equityWeight = 1 - debtWeight;
  return { levBeta, costOfEquity, preTaxCostOfDebt, afterTaxCostOfDebt, debtWeight, equityWeight, wacc: equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt };
}

export type Scenario = { name: string; growth: number[]; targetMargin: number; wacc: number; terminalGrowth: number; taxRate: number; daPct: number; capexPct: number; nwcPct: number };

/** Illustrative scenarios. They are assumptions for exploring the model, not forecasts or company guidance. */
export const SCENARIOS: Record<string, Scenario> = {
  low: { name: "Low", growth: [0.04, 0.035, 0.03, 0.025, 0.02], targetMargin: 0.22, wacc: 0.085, terminalGrowth: 0.015, taxRate: 0.19, daPct: 0.09, capexPct: 0.1, nwcPct: 0.012 },
  base: { name: "Base", growth: [0.07, 0.06, 0.05, 0.04, 0.035], targetMargin: 0.25, wacc: 0.075, terminalGrowth: 0.02, taxRate: 0.18, daPct: 0.09, capexPct: 0.1, nwcPct: 0.01 },
  high: { name: "High", growth: [0.09, 0.08, 0.07, 0.055, 0.045], targetMargin: 0.27, wacc: 0.07, terminalGrowth: 0.025, taxRate: 0.17, daPct: 0.09, capexPct: 0.1, nwcPct: 0.008 },
};

/** Builds DCF inputs for AstraZeneca from the dataset (FY2025 base year, USD millions). */
export function dcfInputsFor(ds: Dataset, scenario: Scenario = SCENARIOS.base, company = "astrazeneca"): DcfInputs {
  const c = comparable(ds, company, 2025, "usd");
  const g = (m: string) => line(ds, company, 2025, m, "usd") ?? 0;
  return {
    baseRevenue: c.revenue,
    baseOperatingMargin: c.operatingMargin,
    growth: scenario.growth,
    targetMargin: scenario.targetMargin,
    taxRate: scenario.taxRate,
    daPct: scenario.daPct,
    capexPct: scenario.capexPct,
    nwcPct: scenario.nwcPct,
    wacc: scenario.wacc,
    terminalGrowth: scenario.terminalGrowth,
    bridge: {
      debtInclLeases: c.debtInclLeases,
      cash: c.cash,
      equityMethodInvestments: g("equity_method_investments"),
      pensionDeficit: g("pension_liability"),
      nonControllingInterests: g("nci_book"),
    },
    sharesMillions: line(ds, company, 2025, "shares_outstanding_m", "usd") ?? NaN,
  };
}

export type Grid = { rows: number[]; cols: number[]; values: number[][] };

/** Value per share across WACC (rows) and terminal growth (columns). Cells where WACC <= growth are NaN. */
export function sensitivity(i: DcfInputs, waccs: number[], growths: number[], pick: "valuePerShare" | "enterpriseValue" = "valuePerShare"): Grid {
  return {
    rows: waccs,
    cols: growths,
    values: waccs.map((w) => growths.map((g) => (w > g ? runDcf({ ...i, wacc: w, terminalGrowth: g })[pick] : NaN))),
  };
}

/** Value per share across revenue-growth shift (rows, added to every year) and target margin (columns). */
export function sensitivityOperating(i: DcfInputs, growthShifts: number[], margins: number[]): Grid {
  return {
    rows: growthShifts,
    cols: margins,
    values: growthShifts.map((s) => margins.map((m) => runDcf({ ...i, growth: i.growth.map((x) => x + s), targetMargin: m }).valuePerShare)),
  };
}
