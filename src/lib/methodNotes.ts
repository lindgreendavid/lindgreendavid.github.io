// Method notes: a paper-style write-up of each project (question, data, method, results, validation, threats to validity, reproduction, references).
// Numbers that come from code (intervals, simulation results, correlations) are computed here at build time so the notes cannot drift from the tools.
import ma from "../data/ma/dataset.json";
import creditExtra from "../data/credit/extra.json";
import summary from "../data/research/eval-summary.json";
import { parseRatio, wilson } from "./stats.ts";
import { compareBriefs } from "./ma/screen.ts";
import type { Company, Dataset } from "./ma/screen.ts";
import { buildTargets, defaultTarget } from "./lbo/targets.ts";
import { inputsFor, monteCarlo, runLbo, tornado } from "./lbo/model.ts";
import { DEFAULT_OPTIONS, buildRows, compact, rankRows, validityChecks, weightRobustness } from "./credit/model.ts";
import type { Extra } from "./credit/model.ts";

export type Note = {
  slug: string;
  title: string;
  projectPath: string;
  abstract: string;
  question: string;
  why: string;
  data: string[];
  method: string[];
  results: string[];
  validation: string[];
  threats: string[];
  notChecked: string[];
  reproduce: string[];
  references: string[];
  changelog: { version: string; date: string; change: string }[];
};

export const VERSION = "1.0";
export const DATE = "2026-11-01";
export const AUTHOR = "David Lindgreen";

const BUILT =
  "Designed and directed by David Lindgreen. The code was written with AI assistance (Claude). It is checked by the unit tests and filing checks described here and was not independently reviewed by a person outside the project.";
export const BUILT_WITH = BUILT;

const pc = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const maData = ma as unknown as Dataset;

function research(): Note {
  const rows = summary.sets.map((x) => {
    const { k, n } = parseRatio(x.v21.overall);
    const w = wilson(k, n);
    return `${x.name}: ${x.v21.overall} correct with version 2.1 (95% interval ${pc(w.lo)} to ${pc(w.hi)}).`;
  });
  const total = summary.sets.reduce((a, x) => a + x.v21.questions, 0);
  return {
    slug: "research-assistant",
    title: "Annual-Report Research Assistant: method note",
    projectPath: "/projects/research-assistant/",
    abstract: `A question-answering tool over the FY2025 Forms 20-F of Novartis, AstraZeneca and GSK that returns a quoted source passage with a link, a calculation from a reconciled dataset, or a refusal. It contains no language model. It was evaluated on ${total} hand-written questions in five sets, each run on three versions of the engine, with the engine frozen before blind sets were run. Performance is moderate and fragile to wording; the failures are listed.`,
    question: "Can a transparent retrieval system with a calculator and an explicit scope guard answer factual questions about annual reports with a traceable source, and how does it fail?",
    why: "Fluent chat tools answer without a source and can be wrong. An analyst needs an answer that points to the filing, a number that can be recomputed, and a clear refusal when the documents cannot support an answer. How such a system is tested matters as much as how it is built.",
    data: [
      "Three FY2025 Forms 20-F from the SEC (Novartis, AstraZeneca, GSK), retrieved 2026-10-20, cut into 3,214 passages that keep a section path and the nearest element link in the filing. No page numbers are used because the SEC HTML has none.",
      "The reconciled dataset of the Pharma Valuation Explorer, used by the calculator.",
      "Five question sets written by the author: a development set (41), held-out set 1 (26), held-out set 2 (30, paraphrased), held-out set 3 (21, blind, paraphrased, written before version 2 existed) and set 4 (24, paraphrased plus scope probes, written before version 2.1 was run on it).",
    ],
    method: [
      "Three stages, none of which generates text. (1) A scope guard refuses investment advice, live prices, forecasts and companies outside the corpus. (2) A deterministic calculator answers numerical questions (margins, cash flow, net debt, tax rate, growth, comparisons) from the reconciled dataset and shows the formula. (3) Retrieval ranks passages with BM25 and refuses when the best passage lacks the question's key terms.",
      "Version 2 adds Porter stemming, a small hand-written thesaurus and corpus-derived neighbours treated as the same idea at a discount, and a bonus for query words that sit together. Version 2.1 tightens the scope guard after an outside probe showed an off-topic question was answered with unrelated passages.",
      "Evaluation: each question has a gold answer or an expected refusal. Questions are scored as correct, wrongly answered, wrongly refused or correctly refused; lookups are also scored by whether the right passage is first or in the top five. The engine is frozen before each blind set is run, and every version is run on every set so changes can be compared.",
    ],
    results: [
      ...rows,
      "Version 2 raised the paraphrased held-out set 2 from 7/30 to 18/30 but lowered the original development set from 31/41 to 27/41, because it let two unanswerable questions through. Tuning on a set improves that set and can hurt another, which is why blind sets were written first.",
      "Lookups remain the weak point: the right passage is often in the top five but not first, and some paraphrases are missed entirely. The intervals are wide because each set has 21 to 41 questions, so a difference of a few questions is within chance.",
    ],
    validation: [
      "20 unit tests cover the scope guard, the calculator, the retrieval and refusal thresholds and the stemmer.",
      "Gold answers were written with AI assistance and checked by the author's reading; the author's own line-by-line check of every gold answer is not recorded.",
      "An external AI-assisted technical check reviewed the evaluation and its corrections were adopted. It is not an independent human audit.",
    ],
    threats: [
      "The author wrote the questions, the gold answers and the thesaurus, so the evaluation is not independent of the system's design. Blind sets reduce but do not remove this.",
      "Five small question sets, one corpus of three filings, three companies in one sector: results may not transfer to other filings or other wording.",
      "Passages are cut by a heuristic; a passage boundary can split an answer.",
      "BM25 and the refusal thresholds were tuned by hand on earlier sets.",
    ],
    notChecked: ["A second question writer.", "A comparison with a language-model baseline.", "Human relevance judgments of the retrieved passages."],
    reproduce: [
      "python -I tools/research/extract-passages.py",
      "node tools/research/eval.ts",
      "node --test tests/research/research.test.ts",
    ],
    references: [
      "Robertson, S. and Zaragoza, H. (2009). The probabilistic relevance framework: BM25 and beyond. Foundations and Trends in Information Retrieval, 3(4), 333-389.",
      "Porter, M. F. (1980). An algorithm for suffix stripping. Program, 14(3), 130-137.",
      "Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference. Journal of the American Statistical Association, 22(158), 209-212.",
      "Brown, L. D., Cai, T. T. and DasGupta, A. (2001). Interval estimation for a binomial proportion. Statistical Science, 16(2), 101-133.",
    ],
    changelog: [
      { version: "1.0", date: DATE, change: "Method note, Wilson intervals on the evaluation table, evaluation stated as not independent of the design." },
      { version: "0.4", date: "2026-10-23", change: "Version 2.1 scope guard frozen; set 4 written before the engine was run on it; corrections from the technical verification." },
      { version: "0.3", date: "2026-10-23", change: "Version 2 retrieval (stemming, thesaurus, neighbours, phrase bonus); blind sets 2 and 3." },
      { version: "0.1", date: "2026-10-21", change: "First release: scope guard, calculator, BM25 retrieval; development and held-out set 1." },
    ],
  };
}

function pharma(): Note {
  return {
    slug: "pharma-valuation",
    title: "Pharma Valuation Explorer: method note",
    projectPath: "/projects/pharma-valuation/",
    abstract:
      "A like-for-like comparison of Novartis, AstraZeneca and GSK for FY2023 to FY2025 built from SEC XBRL data, and a transparent discounted cash flow model of AstraZeneca. The note sets out how figures were chosen and reconciled, which comparability choices were made, and what the valuation depends on. In the base case the result is dominated by the discount rate and the terminal value, not by any reconciled figure.",
    question: "Can three large IFRS reporters be compared on one basis from public filings alone, and how much of a DCF value rests on assumptions rather than evidence?",
    why: "Large pharmaceutical groups define revenue, net debt and free cash flow differently, and a DCF looks precise whatever its inputs. Separating what is reported from what is assumed is the core skill in valuation.",
    data: [
      "SEC XBRL company facts for the three companies' Forms 20-F, FY2023 to FY2025 (retrieved 2026-10-20). Each figure keeps its tag, accession number and filing date.",
      "European Central Bank euro foreign exchange reference rates (annual average for flows, year-end for balances) for translating GSK's pounds into dollars.",
      "For the discount rate: the 10-year US Treasury yield (FRED, 22 October 2026), Damodaran's January 2026 estimates of the equity risk premium, industry unlevered beta, industry debt to equity and rating-based credit spreads, and AstraZeneca's FY2025 Form 20-F for its credit ratings and its own 7.5% impairment-test discount rate.",
    ],
    method: [
      "Figure selection: for each metric one tag is chosen by priority and the same tag is used for all years of a company where possible, so growth is not an artefact of a tag change. Anything not found stays missing.",
      "Comparability: profit is from continuing operations; lease liabilities are included in debt; revenue definitions differ (Novartis net sales plus other revenues, AstraZeneca total revenue, GSK turnover) and are stated; GSK is translated at ECB rates.",
      "Valuation: free cash flow to the firm for five years (operating profit after tax plus depreciation and amortisation less capex including intangibles less working-capital investment), a Gordon-growth terminal value, and an enterprise-to-equity bridge. Scenarios (low, base, high) and two sensitivity grids are provided.",
      "Discount rate scenario: WACC from CAPM with a relevered beta, WACC = E/V x Ke + D/V x Kd x (1 - t), with every input sourced and dated. The typed-in 7.5% is kept as a lower comparison case because AstraZeneca discloses 7.5% for impairment testing.",
    ],
    results: [
      "In the base case about 78% of the enterprise value is terminal value, so the result is mostly a statement about long-run assumptions.",
      "Moving the discount rate from 7.5% to a sourced 8.8% lowers the modelled value from $132.41 to $103.69 per ordinary share (about 22%) with the cash flows unchanged. An equity risk premium of 4.0% or 5.0% gives $107.65 or $92.10 per share.",
      "Definitions matter: GSK's net debt differs by about 130 million pounds depending on whether liabilities held for sale and liquid investments are counted. An external check found this and the page now shows both.",
    ],
    validation: [
      "137 figures were compared with the SEC's rendered statement pages with no mismatches; 170 automated checks cover accounting identities, units, currency bands and completeness.",
      "19 unit tests cover the valuation maths (including a closed-form DCF case and the bridge identity) and input validation.",
      "The Excel workbook uses live formulas and was recalculated in Microsoft Excel; its checks are TRUE and it matches the web model.",
      "An external AI-assisted technical check reproduced the DCF with separate code and its corrections were adopted.",
    ],
    threats: [
      "Industry beta and industry debt to equity stand in for the company's own, and the equity risk premium is a January 2026 estimate used in October.",
      "The credit spread is a rating-based proxy, not a measured bond spread; the 25% tax rate used for the debt shield and relevering is an assumption.",
      "Market-value weights are not used because no share-price source whose terms allow redistribution was available.",
      "The bridge is partial: it omits contingent consideration, litigation and other provisions, deferred tax, other investments and dividends declared.",
      "One company, three years, tag selection by one author.",
    ],
    notChecked: ["GSK's FY2023 debt and share counts for 2023 and 2024 are not reconciled.", "An independent review by a finance professional.", "A peer-set beta."],
    reproduce: [
      "node tools/pharma/fetch-sec.mjs",
      "node tools/pharma/build-dataset.mjs",
      "node tools/pharma/validate-dataset.mjs",
      "node --test tests/pharma/model.test.ts",
      "python tools/pharma/build-workbook.py",
    ],
    references: [
      "Damodaran, A. (2012). Investment Valuation: Tools and Techniques for Determining the Value of Any Asset, 3rd ed. Wiley.",
      "Koller, T., Goedhart, M. and Wessels, D. (2020). Valuation: Measuring and Managing the Value of Companies, 7th ed. Wiley.",
      "Modigliani, F. and Miller, M. H. (1958). The cost of capital, corporation finance and the theory of investment. American Economic Review, 48(3), 261-297.",
      "US Securities and Exchange Commission. EDGAR XBRL company facts API (data.sec.gov).",
    ],
    changelog: [
      { version: "1.0", date: DATE, change: "Method note; unit-test count corrected to 19; limits and validation restated." },
      { version: "0.3", date: "2026-10-26", change: "WACC built from sourced inputs shown as a scenario next to the 7.5% case." },
      { version: "0.2", date: "2026-10-23", change: "Corrections from the technical verification: D&A history, debt basis, GSK net-debt reconciliation, input validation." },
      { version: "0.1", date: "2026-10-21", change: "First release." },
    ],
  };
}

function screening(): Note {
  const c = compareBriefs(maData);
  return {
    slug: "ma-screening",
    title: "Strategic M&A Screening Workbench: method note",
    projectPath: "/projects/ma-screening/",
    abstract: `An explainable screen of 28 US-listed pharma and biotech companies against a hypothetical buyer brief. Criteria are scored against fixed anchors, weights are adjustable, missing data is flagged and handled by a stated policy, and the stability of the ranking is tested by 1,000 seeded re-weightings and by three different briefs. ${c.inAll.join(", ")} stay in the top five under all three briefs. The screen is not a valuation.`,
    question: "How should a long list of acquisition candidates be reduced to a short list so that the criteria are explicit and the fragility of the order is visible?",
    why: "Ranking by gut feel is easy to do and hard to defend. A screen should state its rules, show what is missing and show how much the order depends on the weights chosen.",
    data: [
      "SEC XBRL company facts for 28 US-listed pharma and biotech Form 10-K filers chosen by the author (a convenience sample), FY2022 to FY2025. Each figure keeps its tag, accession and date. Debt at nine companies and a few other figures were read from the 10-K text where the standard tags missed them.",
      "No price data is bundled. Optional valuation and deal-size criteria switch on only if the user pastes share prices.",
    ],
    method: [
      "Hard filters: revenue range, positive operating income and complete core data. Excluded companies are listed with the reason.",
      "Scoring: each criterion is mapped to 0 to 100 by straight lines through fixed anchors taken from the brief (not from the other companies, so a score does not move when the universe changes), then combined with adjustable weights. A missing criterion is dropped and the weights rescaled, or scored zero, as the user chooses.",
      "Stability: 1,000 random re-weightings (each weight multiplied by exp(0.5 Z), where Z is standard normal) give each company's rank range and the share of draws in the top five; one-at-a-time changes and the two missing-data policies are also shown. The shortlist is then recomputed under three different briefs.",
      "Output: a ranked table, data flags and a generated screening memo built from fixed sentence templates that always lists what was not assessed.",
    ],
    results: [
      `Under the default brief ${compareBriefs(maData).results[0].passed} of 28 companies pass the filters. ${c.inAll.join(", ")} are in the top five under all three briefs and ${c.inMajority.join(", ")} in two of three.`,
      "Standard debt tags missed or understated debt at several companies; debt and debt-like items for nine companies were read from the 10-K balance sheets, including 2.3 billion dollars of sold future royalties at one company, which counts as debt by default and can be switched off.",
      "The page shows each company's rank range across the re-weightings and its share of draws in the top five, so a reader can see which positions are fragile and which are not.",
    ],
    validation: [
      "437 automated data checks (199 of them confirm that a FY2025 figure appears as printed in the company's 10-K text) and 54 checks of figures read by hand from filings; 30 unit tests cover scoring, filters, royalty-debt, market-cap and one-off maths, missing-data handling and the sensitivity logic.",
      "An external AI-assisted technical check found that depreciation and amortisation omitted intangible amortisation for two companies; this was corrected.",
    ],
    threats: [
      "The universe is a convenience sample of companies the author chose, and the scoring anchors and the three briefs are the author's, so the brief comparison tests the weights only.",
      "Reported figures include one-offs; two companies have identified one-off revenue flagged on the page.",
      "The share count excludes dilution and there is no bundled price source.",
      "One company's 10-K (BioMarin) was not downloaded, so it is unchecked against the filing text.",
    ],
    notChecked: ["Independent review of the anchors and briefs.", "Valuation, accretion or deal feasibility (out of scope by design).", "BioMarin's figures against its 10-K text."],
    reproduce: [
      "node tools/ma/fetch-sec.mjs",
      "node tools/ma/build-dataset.mjs",
      "node tools/ma/validate-dataset.mjs",
      "node tools/ma/verify-balance-sheet.mjs",
      "node --test tests/ma/screen.test.ts",
    ],
    references: [
      "Saltelli, A., Ratto, M., Andres, T., Campolongo, F., Cariboni, J., Gatelli, D., Saisana, M. and Tarantola, S. (2008). Global Sensitivity Analysis: The Primer. Wiley.",
      "US Securities and Exchange Commission. EDGAR XBRL company facts API (data.sec.gov).",
    ],
    changelog: [
      { version: "1.0", date: DATE, change: "Method note; threats to validity and the sampling of the universe stated." },
      { version: "0.3", date: "2026-10-23", change: "Three-brief comparison; D&A and balance-sheet corrections from the technical verification." },
      { version: "0.2", date: "2026-10-21", change: "Optional user-entered prices for valuation and deal-size criteria; royalty-financing debt." },
      { version: "0.1", date: "2026-10-21", change: "First release." },
    ],
  };
}

function lbo(): Note {
  const t = defaultTarget(maData, buildTargets(maData));
  const i = inputsFor(t);
  const r = runLbo(i);
  const m = monteCarlo(i, { draws: 3000, seed: 1 });
  const tn = tornado(i);
  const top = tn.rows.slice(0, 3).map((x) => x.driver.toLowerCase()).join(", ");
  const e8 = runLbo({ ...i, exitMultiple: i.exitMultiple - 2 }).irr;
  const e12 = runLbo({ ...i, exitMultiple: i.exitMultiple + 2 }).irr;
  return {
    slug: "lbo-workbench",
    title: "LBO Workbench: method note",
    projectPath: "/projects/lbo-workbench/",
    abstract: `A leveraged-buyout model on real SEC 10-K figures for the companies in the screening project: sources and uses, a five-year debt schedule with a cash sweep, MOIC and IRR, a value-creation bridge, sensitivity grids, a seeded Monte Carlo of the return and a one-at-a-time tornado. Deals are hypothetical and every price, rate and operating assumption is an input. In the default case the return depends most on ${top}.`,
    question: "Where does a buyout return come from, and how much does it depend on assumptions that cannot be known in advance?",
    why: "An LBO is the standard test of whether someone understands how value, debt and cash flow fit together. A single IRR hides which assumption does the work, so the useful output is the decomposition and the range.",
    data: [
      "FY2025 revenue, operating income, depreciation and amortisation, debt, cash and short-term investments from the 10-K data of the M&A screening project. EBITDA is operating income plus depreciation and amortisation as reported, with no adjustments.",
      "Capex, loan terms, the entry and exit multiples and all operating assumptions are not in the data and are stated assumptions.",
    ],
    method: [
      "Funding: enterprise value is the entry multiple times EBITDA; uses are enterprise value plus fees; sources are senior and subordinated debt (multiples of EBITDA) and sponsor equity as the remainder.",
      "Operations and debt: revenue grows at the inputs; EBITDA margin moves in a straight line to the year-5 margin; interest is charged on opening balances (no circular calculation); the senior debt has a mandatory repayment and a cash sweep; the subordinated debt is repaid at exit; tax is charged on EBIT less interest, never below zero.",
      "Return: exit enterprise value is the exit multiple times year-5 EBITDA; equity at exit is that less net debt; MOIC is exit equity over equity invested and IRR is MOIC to the power of one fifth, less one. The bridge splits the equity gain exactly into EBITDA growth, multiple change, debt paid down and fees.",
      "Uncertainty: a Monte Carlo of 3,000 cases (fixed seed) varies a common revenue-growth shift (normal, standard deviation 3 points) plus year noise (2 points), the year-5 margin (normal, 3 points), the exit multiple (triangular, within 2 turns) and the senior rate (normal, 1 point). A tornado moves one input at a time by a stated amount. The spreads are illustrative choices, not estimates from data.",
    ],
    results: [
      `For the default company (chosen as the highest-ranked in the default screen with no identified one-offs; not a recommendation) the base case gives sponsor equity of ${Math.round(r.sponsorEquity)} million dollars, MOIC ${r.moic.toFixed(2)}x and IRR ${pc(r.irr, 1)}.`,
      `Moving the exit multiple two turns either way changes the IRR from ${pc(e8, 1)} to ${pc(e12, 1)}. The Monte Carlo median is ${pc(m.p50, 1)} with a 5th to 95th percentile range of ${pc(m.p5, 1)} to ${pc(m.p95, 1)}; ${pc(m.probLoss, 1)} of cases lose money and ${pc(m.probBelow10)} return less than 10% a year.`,
      "More leverage raises the base-case return and widens the downside, which the second sensitivity grid shows side by side.",
    ],
    validation: [
      "17 unit tests cover the funding identity, a closed-form case (no debt, no growth, no tax), the bridge identity, the debt schedule, validation, the sensitivity grids, the reproducibility of the simulation and the tornado.",
      "The Excel workbook uses live formulas and was recalculated in Microsoft Excel: all seven checks are TRUE and equity, MOIC, IRR, the bridge and each year's EBITDA, senior debt and cash match the web model to six decimals. The sensitivity sheet holds pasted values.",
    ],
    threats: [
      "Hypothetical: the entry price, exit multiple, loan terms and operating assumptions are inputs. The defaults are not a view on any company.",
      "No revolver, minimum cash, interest-deductibility limit, fee amortisation, management equity, dividends or purchase-price accounting.",
      "Reported EBITDA includes one-offs; pharma and biotech cash flows are less predictable than the model assumes.",
      "The Monte Carlo spreads are chosen, not measured, and the draws are treated as independent apart from the common growth shock.",
    ],
    notChecked: ["Independent review by a finance professional.", "Comparison with transaction data.", "A model with a revolver and average-balance interest."],
    reproduce: [
      "node tools/lbo/export-reference.ts",
      "python tools/lbo/build-workbook.py",
      "powershell tools/lbo/recalc-workbook.ps1",
      "node --test tests/lbo/model.test.ts",
      "node tools/lbo/preview-uncertainty.ts",
    ],
    references: [
      "Kaplan, S. N. and Stromberg, P. (2009). Leveraged buyouts and private equity. Journal of Economic Perspectives, 23(1), 121-146.",
      "Rosenbaum, J. and Pearl, J. (2013). Investment Banking: Valuation, Leveraged Buyouts, and Mergers and Acquisitions, 2nd ed. Wiley.",
      "Saltelli, A., Ratto, M., Andres, T., Campolongo, F., Cariboni, J., Gatelli, D., Saisana, M. and Tarantola, S. (2008). Global Sensitivity Analysis: The Primer. Wiley.",
    ],
    changelog: [
      { version: "1.0", date: DATE, change: "Monte Carlo and tornado added; method note." },
      { version: "0.1", date: "2026-11-01", change: "First release: model, page, Excel workbook, 13 unit tests." },
    ],
  };
}

function credit(): Note {
  const ks = (Object.values(maData.companies) as Company[]).map((c) => compact(c, (creditExtra as unknown as Extra).companies[c.ticker]));
  const rows = rankRows(buildRows(Object.values(maData.companies) as Company[], creditExtra as unknown as Extra, DEFAULT_OPTIONS));
  const rb = weightRobustness(rows, { draws: 1000, seed: 1 });
  const stable = Object.values(rb.perTicker).filter((x) => x.sameBand >= 0.9).length;
  const v = validityChecks(ks, DEFAULT_OPTIONS, 5000);
  const low = rows.filter((x) => x.bucket === "Low strain").length;
  const f = (n: number | null) => (n === null ? "n/a" : n.toFixed(2));
  return {
    slug: "credit-risk-screen",
    title: "Credit Risk Screen: method note",
    projectPath: "/projects/credit-risk-screen/",
    abstract: `A first-pass credit screen of 28 US pharma and biotech companies from their 10-K figures: net leverage, interest cover, cash flow to debt, liquidity and margin scored against stated anchors, an EBITDA stress test, the fall in EBITDA each company can absorb before a leverage or cover limit is hit, and an Altman Z-double-prime cross-check. It is not a credit rating. The score is stable to re-weighting but shows no persistence over three years and no evidence of predicting later earnings in this small sample.`,
    question: "How much financial strain could a group of borrowers take, and is a simple, explainable scorecard stable, informative and consistent with an established distress measure?",
    why: "Credit work asks how much trouble a borrower can take before it cannot pay. One ratio never tells the story, and a scorecard that is not tested for robustness can mislead, so the tests are part of the product.",
    data: [
      "The M&A project's 10-K dataset (revenue, operating income, D&A, operating cash flow, cash, short-term investments, debt, assets) plus eight extra lines read from the same SEC XBRL feed: interest expense (or cash interest paid), capex, current assets and liabilities, total liabilities, equity and retained earnings. FY2022 to FY2025; the latest filing wins; nothing missing is filled.",
      "FY2025 coverage of the 28 companies: interest expense 18, cash interest paid 22, capex 26, total liabilities 24 (otherwise total assets less equity, flagged), the other lines 28.",
    ],
    method: [
      "Ratios: net debt over EBITDA, EBITDA over interest, (operating cash flow less capex) over debt, (cash plus short-term investments) over debt, and EBITDA margin, with explicit rules for net cash, no debt and non-positive EBITDA.",
      "Scoring: each ratio is mapped to 0 to 100 by straight lines through the author's anchors; weights are 30, 25, 20, 15 and 10; a missing factor is dropped and the weights are rescaled. Bands are Low, Moderate, Elevated and High strain at 75, 55 and 35. These thresholds are choices, written down before the results were examined, not an agency methodology.",
      "Stress and headroom: EBITDA and operating cash flow fall by a set share of EBITDA (before tax); cash burn is added to net debt; interest is unchanged. Headroom is the largest EBITDA fall such that net leverage stays at or below a limit and interest cover at or above a floor, computed in closed form.",
      "Cross-check: Altman Z-double-prime (6.56 x working capital / assets + 3.26 x retained earnings / assets + 6.72 x EBIT / assets + 1.05 x book equity / liabilities), with the commonly cited zones.",
      "Robustness: 1,000 random re-weightings (each weight times exp(0.5 Z)) give each company's rank range and the share of draws in the same band. Exploratory validity checks use Spearman rank correlation with a two-sided permutation p-value (5,000 shuffles, fixed seed), on companies scored on the full weights in the years compared.",
    ],
    results: [
      `At the default settings ${low} of 28 companies fall in the Low strain band; the set was chosen as profitable and commercial-stage, so the bands describe this set only.`,
      `${stable} of ${rows.length} companies keep their band in at least 90% of the re-weightings; the others sit near a band edge.`,
      `The FY2022 score and the FY2025 score have a rank correlation of ${f(v[0].rho)} across ${v[0].n} companies (permutation p = ${f(v[0].p)}): no detectable persistence over three years. The screen is a snapshot.`,
      `The FY2025 score and the Altman Z-double-prime have a rank correlation of ${f(v[1].rho)} across ${v[1].n} companies (p = ${f(v[1].p)}): moderate agreement. They disagree most for net-cash companies with accumulated deficits, which the Altman model penalises.`,
      `The FY2022 score and EBITDA growth to FY2025 have a rank correlation of ${f(v[2].rho)} across ${v[2].n} companies (p = ${f(v[2].p)}): no evidence that the score predicts later earnings, in a sample too small to rule out an effect.`,
    ],
    validation: [
      "337 automated checks on the extra data all pass (each FY2025 figure found as printed in the 10-K text; current assets not above total assets; liabilities plus equity within 3% of assets; no negative interest or capex; one period end). BioMarin is unchecked because its 10-K was not downloaded.",
      "19 unit tests cover the ratios, the scoring anchors, the weight rescaling, the band boundaries, the closed-form headroom (stressing by exactly the headroom lands on the limit), the stress test, the Altman worked example, the weight robustness and the permutation test.",
    ],
    threats: [
      "The anchors, weights and band edges are the author's choices and a different set would move companies between bands.",
      "28 companies in one sector chosen by the author; the validity tests have little statistical power and are exploratory.",
      "FY2022 debt is missing for several companies (balance-sheet debt was read for FY2025 only), so the multi-year tests use only fully scored companies.",
      "EBITDA is as reported and includes one-offs and impairments; there is no data on maturities, covenants, undrawn facilities or refinancing risk.",
      "Altman Z-double-prime was fitted to other firms in other decades and is shown as a cross-check, not as truth.",
    ],
    notChecked: ["A test against actual defaults or rating changes.", "Independent review of the thresholds.", "BioMarin's extra figures against its 10-K text."],
    reproduce: [
      "node tools/credit/build-extra.mjs",
      "node tools/credit/validate-extra.mjs",
      "node tools/credit/export-downloads.mjs",
      "node --test tests/credit/model.test.ts",
      "node tools/credit/preview-validity.ts",
    ],
    references: [
      "Altman, E. I. (1968). Financial ratios, discriminant analysis and the prediction of corporate bankruptcy. The Journal of Finance, 23(4), 589-609.",
      "Altman, E. I. (2000). Predicting financial distress of companies: revisiting the Z-score and ZETA models. Working paper, NYU Stern School of Business.",
      "Merton, R. C. (1974). On the pricing of corporate debt: the risk structure of interest rates. The Journal of Finance, 29(2), 449-470.",
      "Spearman, C. (1904). The proof and measurement of association between two things. American Journal of Psychology, 15(1), 72-101.",
      "Good, P. (2005). Permutation, Parametric, and Bootstrap Tests of Hypotheses, 3rd ed. Springer.",
    ],
    changelog: [
      { version: "1.0", date: DATE, change: "Weight robustness and exploratory validity checks added; method note." },
      { version: "0.1", date: DATE, change: "First release: extra SEC data, scorecard, stress test, headroom, Altman cross-check, 14 unit tests." },
    ],
  };
}

export const noteBuilders: Record<string, () => Note> = { "pharma-valuation": pharma, "research-assistant": research, "ma-screening": screening, "lbo-workbench": lbo, "credit-risk-screen": credit };
export const slugs = Object.keys(noteBuilders);
