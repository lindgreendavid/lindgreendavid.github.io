// All facts on this page come from David's LinkedIn export, his GitHub profile and Lab Notes.
// Nothing here is invented: edit this file to change what the site says.

// One place for the Lab Notes address (Cloudflare Worker, custom domain live since 2026-10-20).
const NOTES = "https://notes.lindgreendavid.com";

export const person = {
  name: "David Lindgreen",
  email: "lindgreendavid@gmail.com",
  linkedin: "https://www.linkedin.com/in/david-lindgreen-625868303/",
  github: "https://github.com/lindgreendavid",
  labNotes: NOTES + "/",
  location: "Frankfurt, Germany",
};

// Impressum data (§ 5 DDG needs a postal address where you can be reached; a P.O. box is not enough).
// The legal pages refuse to build until street and city are filled in.
export const legal = {
  name: "David Lindgreen",
  street: "Mainzer Landstraße 114a",
  city: "60327 Frankfurt am Main, Deutschland",
  updated: "20. Oktober 2026",
};

const LN = NOTES + "/posts/";
const GH = "https://github.com/lindgreendavid/";

export type Note = {
  name: string;
  field: string;
  evidence: string;
  headline: string;
  summary: string;
  note: string;
  repo: string;
  live?: string;
};

// Ordered for relevance to finance and AI roles first, then breadth.
export const notes: Note[] = [
  {
    name: "Data Contract Observatory",
    field: "Data engineering",
    evidence: "Live ECB feed",
    headline: "A data pipeline can keep running while its meaning changes. This observatory records the difference.",
    summary: "Tracks how a pipeline's meaning shifts over time, using a live ECB data feed checked against a frozen consumer contract. A post-release audit shows the review signal fires far more often than a normal model predicts.",
    note: LN + "data-contract-observatory-revision-evidence",
    repo: GH + "data-contract-observatory",
    live: "https://lindgreendavid.com/data-contract-observatory/",
  },
  {
    name: "Fairshift Lab",
    field: "Responsible AI",
    evidence: "Fairness stress test",
    headline: "A model that looks fair can quietly stop being fair. Here's how to catch it.",
    summary: "Stress-tests a fairness measurement against label noise, measurement error and small samples. Person-level uncertainty shows reported gap reductions on the Adult data are not distinguishable from test-set noise.",
    note: LN + "fairshift-lab-robustness",
    repo: GH + "fairshift-lab",
    live: "https://fairshift-lab-interactive.lindgreendavid.workers.dev",
  },
  {
    name: "Backtests lie",
    field: "Quantitative finance",
    evidence: "Simulation plus real ECB series",
    headline: "Test enough trading rules on pure noise and the best one looks brilliant.",
    summary: "The best of 4,916 rules shows a Sharpe ratio near 1.2 in-sample and about zero on new data; a yearly walk-forward on EUR/USD looks the same as a random null. Educational, not a trading edge.",
    note: LN + "backtests-lie-selection-bias",
    repo: GH + "backtests-lie",
    live: "https://lindgreendavid.com/backtests-lie/",
  },
  {
    name: "Climate Twin Frankfurt",
    field: "Climate data",
    evidence: "Estimate with interval",
    headline: "Is Frankfurt actually warmer than the countryside around it? We measured it.",
    summary: "Estimates Frankfurt's urban heat island from decades of paired weather-station records, reported with a confidence interval.",
    note: LN + "climate-twin-frankfurt-heat-island",
    repo: GH + "climate-twin-frankfurt",
    live: "https://climate-twin-frankfurt-interactive.lindgreendavid.workers.dev",
  },
  {
    name: "Neural Geometry Lab",
    field: "Machine learning",
    evidence: "30 runs, 4 diagnostics",
    headline: "A neural network's geometry kept changing after perfect training accuracy. Did that make it generalize?",
    summary: "Tests four neural-collapse diagnostics across 30 network runs.",
    note: LN + "neural-geometry-lab-collapse",
    repo: GH + "neural-geometry-lab",
    live: "https://lindgreendavid.com/neural-geometry-lab/",
  },
  {
    name: "Reaction Integrity Lab",
    field: "Chemistry and ML",
    evidence: "Leakage audit",
    headline: "The same reaction benchmark scored 68% or 36%. The dataset definition changed.",
    summary: "Audits cleaning, leakage and apparent accuracy in a reaction-condition benchmark, separating verified split integrity from published scores that still need reproduction.",
    note: LN + "reaction-integrity-lab-cleaning-leakage",
    repo: GH + "reaction-integrity-lab",
  },
  {
    name: "Mathlab WASM",
    field: "Numerical analysis",
    evidence: "Rust and WebAssembly",
    headline: "When a tiny residual hides the wrong answer.",
    summary: "Compares three root-finding methods and what their stopping rules actually guarantee.",
    note: LN + "mathlab-wasm-root-finding",
    repo: GH + "mathlab-wasm",
    live: "https://lindgreendavid.com/mathlab-wasm/",
  },
  {
    name: "FRB Atlas",
    field: "Astrophysics",
    evidence: "Partial replication",
    headline: "We tried to replicate a real astrophysics paper. It didn't fully replicate, and that's the finding.",
    summary: "Reruns a fast-radio-burst catalog paper's statistical test on the same public data and reports the mismatch.",
    note: LN + "frb-atlas-dispersion-measure",
    repo: GH + "frb-atlas",
    live: "https://frb-atlas-interactive.lindgreendavid.workers.dev",
  },
  {
    name: "Neuro Signal Lab",
    field: "Neuroscience",
    evidence: "Independent dataset",
    headline: "A classic brain response survived a new dataset. Here is exactly what that means.",
    summary: "Tests a preregistered EEG endpoint (P3b) on an independent public dataset.",
    note: LN + "neuro-signal-lab-p3b-robustness",
    repo: GH + "neuro-signal-lab",
  },
  {
    name: "Folding's Edge",
    field: "Structural biology",
    evidence: "Where confidence fails",
    headline: "AlphaFold tells you how confident it is. Sometimes it's confidently wrong, and that's predictable.",
    summary: "Tests whether AlphaFold's pLDDT confidence score predicts intrinsic protein disorder, and where that prediction fails.",
    note: LN + "foldings-edge-plddt-disorder",
    repo: GH + "foldings-edge",
    live: "https://foldings-edge-interactive.lindgreendavid.workers.dev",
  },
  {
    name: "Snowflake Evolution Lab",
    field: "Evolution",
    evidence: "Association, not threshold",
    headline: "A yeast cluster became 20,000 times larger. When did it become an individual?",
    summary: "Separates a strong association between cluster size and individuality from a causal threshold that has not been measured.",
    note: LN + "snowflake-evolution-lab-individuality",
    repo: GH + "snowflake-evolution-lab",
  },
  {
    name: "Jovian Resonance Lab",
    field: "Celestial mechanics",
    evidence: "Preregistered ablation",
    headline: "Jupiter's moons keep time. Which physics keeps them together?",
    summary: "Extends a numerical clue over a second decade of data and keeps the model's predictions separate from observations.",
    note: LN + "jovian-resonance-lab-laplace-angle",
    repo: GH + "jovian-resonance-lab",
  },
  {
    name: "Three-Body Lab",
    field: "Physics",
    evidence: "Chaos map",
    headline: "The three-body problem can't be solved. That's not the interesting part.",
    summary: "Uses an orbital integrator to map short-term divergence and locate where stability breaks down.",
    note: LN + "three-body-lab-chaos-boundary",
    repo: GH + "three-body-lab",
    live: "https://three-body-lab-interactive.lindgreendavid.workers.dev",
  },
];

export type Role = {
  dates: string;
  org: string;
  role: string;
  points: string[];
};

export const roles: Role[] = [
  {
    dates: "Oct 2024 to now",
    org: "Sanofi",
    role: "Dual student, Smart Factory",
    points: [
      "Digital Systems & Projects department, Frankfurt.",
      "Built 10+ Power BI dashboards used by about 50 people, designed for senior management and their teams to monitor tickets, errors and maintenance issues at a glance.",
      "Work with high-frequency machine data (a data point every 1 to 2 seconds) in Snowflake, preparing and analysing large datasets for operational reporting.",
      "Developed several internal tools to speed up recurring analysis and reporting tasks.",
      "Contribute to project management on smaller digital projects.",
      "Completed Sanofi's internal AI training, fundamentals and advanced workshops, and apply AI in daily work.",
    ],
  },
  {
    dates: "May 2026 to now",
    org: "Le Wagon",
    role: "Lead teacher, Data Analytics",
    points: [
      "Lead live coding sessions for the Data Analytics Bootcamp: SQL, Python, data cleaning and visualisation.",
      "Support students on real-dataset projects, from structuring the analysis to presenting insights.",
      "Taught and supported 100+ students across the teaching assistant and lead teacher roles.",
    ],
  },
  {
    dates: "Oct 2024 to Jun 2026",
    org: "Le Wagon",
    role: "Teaching assistant",
    points: [
      "Supported students 1:1 through the Data Analytics Bootcamp.",
      "Helped debug code and structure project work, working with instructors to improve the learning experience.",
    ],
  },
  {
    dates: "Oct 2024 to Aug 2028",
    org: "Provadis",
    role: "Business Information Management, dual",
    points: ["Bachelor's degree at the Provadis School of International Management and Technology, Frankfurt. Expected August 2028."],
  },
  {
    dates: "May to Aug 2024",
    org: "Le Wagon",
    role: "Data Analytics bootcamp",
    points: ["Bootcamp in SQL, Python, data cleaning and visualisation."],
  },
  {
    dates: "Oct 2021 to Mar 2024",
    org: "Humboldt-Universität",
    role: "Biology studies, not completed",
    points: ["Studied Biology in Berlin before switching to data and business."],
  },
];

export type Next = { name: string; field: string; status: string; points: string };

// Honest status words: Planned, In progress, First release. Nothing here is "reviewed" or "completed" unless the roadmap says so.
export const next: Next[] = [
  {
    name: "Finance foundations",
    field: "Accounting, markets",
    status: "In progress",
    points: "University of Illinois, Financial Analysis of Organizations, is under way; Wharton's corporate finance and Yale's financial markets are planned after it. One investment-banking job simulation (Bank of America, on Forage) is done.",
  },
  {
    name: "Projects on public filings",
    field: "Valuation, search, M&A screening",
    status: "First releases",
    points: "A pharma valuation explorer, an annual-report research assistant and an M&A screening workbench are published on this site as first releases. They are still in development and not yet independently reviewed.",
  },
  {
    name: "Next short simulation",
    field: "Generative AI",
    status: "Planned",
    points: "A BCG GenAI job simulation on Forage, if the task page is accessible. Not started.",
  },
];

export const toolkit = [
  "Power BI",
  "Snowflake",
  "SQL",
  "Python",
  "Excel",
  "Microsoft Power Platform",
  "TypeScript",
  "Rust and WebAssembly",
  "RAG (introductory)",
];

export const credentials = [
  "Introduction to Retrieval Augmented Generation (RAG)",
  "Snowflake: Introduction Course",
  "Introduction to Microsoft Power Platform",
];
