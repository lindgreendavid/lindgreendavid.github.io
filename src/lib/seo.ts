// One place for what search engines and AI answer engines read: titles, descriptions, social images and structured data (JSON-LD).
// Everything stated here is stated on the pages themselves; nothing is added for ranking only.
import { person } from "../data/site";

export const SITE = "https://lindgreendavid.com";
export const UPDATED = "2026-11-03"; // last substantive change to the site; also the lastmod in sitemap.xml

const PERSON_ID = `${SITE}/#person`;
const SITE_ID = `${SITE}/#website`;

export type Crumb = { name: string; path: string };
export type Seo = { title: string; description: string; image: string; jsonld: object[]; crumbs?: Crumb[]; type?: string };

const personRef = { "@id": PERSON_ID };

export const personLd = {
  "@type": "Person",
  "@id": PERSON_ID,
  name: person.name,
  url: `${SITE}/`,
  jobTitle: "Dual student, Business Information Management",
  description: "Data and AI analyst in Frankfurt, building towards finance. Publishes finance projects on public filings with their limits stated.",
  address: { "@type": "PostalAddress", addressLocality: "Frankfurt am Main", addressCountry: "DE" },
  knowsAbout: ["Discounted cash flow valuation", "Leveraged buyout modelling", "Credit risk analysis", "M&A screening", "Data analytics", "Power BI", "SQL", "Python"],
  sameAs: [person.linkedin, person.github, person.labNotes],
};

const websiteLd = { "@type": "WebSite", "@id": SITE_ID, name: person.name, url: `${SITE}/`, inLanguage: "en", publisher: personRef };

type Page = { path: string; title: string; description: string; image: string; name?: string; app?: { about: string } };

export const PAGES: Record<string, Page> = {
  home: {
    path: "/",
    title: "David Lindgreen: data and AI analyst in Frankfurt",
    description: "Finance projects on public filings: pharma DCF, LBO, credit risk screen, M&A screening and a filings search tool. Frankfurt, Germany.",
    image: "/og/home.png",
  },
  projects: {
    path: "/projects/",
    title: "Finance projects: DCF, LBO, credit risk | David Lindgreen",
    description: "Five finance tools on public SEC and ECB data: DCF, LBO, credit risk, M&A screening and filings search. Each has a method note and stated limits.",
    image: "/og/projects.png",
  },
  "pharma-valuation": {
    path: "/projects/pharma-valuation/",
    name: "Pharma Valuation Explorer",
    title: "Pharma DCF valuation explorer | David Lindgreen",
    description: "Compare Novartis, AstraZeneca and GSK from public filings and run a DCF of AstraZeneca with sensitivities and an Excel model. Educational, not advice.",
    image: "/og/pharma-valuation.png",
    app: { about: "Discounted cash flow valuation and peer comparison of large pharmaceutical companies" },
  },
  "research-assistant": {
    path: "/projects/research-assistant/",
    name: "Annual-Report Research Assistant",
    title: "Annual report search tool for 20-F filings | David Lindgreen",
    description: "Ask questions about the FY2025 20-F reports of Novartis, AstraZeneca and GSK. Get the source passage, a calculation or a refusal, with no generated text.",
    image: "/og/research-assistant.png",
    app: { about: "Question answering over annual reports with source passages, calculations and refusals" },
  },
  "ma-screening": {
    path: "/projects/ma-screening/",
    name: "M&A Screening Workbench",
    title: "M&A screening for pharma and biotech | David Lindgreen",
    description: "Screen 28 US pharma and biotech companies against a hypothetical buyer brief, change the weights and see how fragile the ranking is. Educational.",
    image: "/og/ma-screening.png",
    app: { about: "Preliminary screening of acquisition candidates with adjustable weights and data-gap flags" },
  },
  "lbo-workbench": {
    path: "/projects/lbo-workbench/",
    name: "LBO Workbench",
    title: "LBO model for pharma and biotech | David Lindgreen",
    description: "A leveraged buyout model on real SEC figures: sources and uses, debt schedule, IRR, MOIC and a value bridge, with an Excel file. Hypothetical, educational.",
    image: "/og/lbo-workbench.png",
    app: { about: "Leveraged buyout modelling: returns, debt schedule and sensitivity analysis" },
  },
  "credit-risk-screen": {
    path: "/projects/credit-risk-screen/",
    name: "Credit Risk Screen",
    title: "Credit risk screen: leverage and Altman Z | David Lindgreen",
    description: "Score 28 US pharma and biotech companies on leverage, interest cover and cash flow, stress their earnings and cross-check with Altman Z. Not a rating.",
    image: "/og/credit-risk-screen.png",
    app: { about: "Credit ratio scorecard with an earnings stress test and an Altman Z-double-prime cross-check" },
  },
};

const abs = (p: string) => `${SITE}${p}`;

function breadcrumb(crumbs: Crumb[]) {
  return { "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path) })) };
}

const HOME: Crumb = { name: "Home", path: "/" };
const PROJECTS: Crumb = { name: "Projects", path: "/projects/" };

export function seoFor(key: string): Seo {
  const p = PAGES[key];
  if (key === "home") {
    return {
      ...p,
      jsonld: [{ "@context": "https://schema.org", "@graph": [websiteLd, personLd, { "@type": "ProfilePage", "@id": `${SITE}/#profile`, url: `${SITE}/`, name: p.title, mainEntity: personRef, dateModified: UPDATED, isPartOf: { "@id": SITE_ID } }] }],
    };
  }
  if (key === "projects") {
    const items = Object.entries(PAGES).filter(([k]) => k !== "home" && k !== "projects");
    const crumbs = [HOME, { name: "Projects", path: p.path }];
    return {
      ...p,
      crumbs,
      jsonld: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Finance projects on public filings",
          url: abs(p.path),
          description: p.description,
          author: personRef,
          isPartOf: { "@id": SITE_ID },
          mainEntity: { "@type": "ItemList", itemListElement: items.map(([, v], i) => ({ "@type": "ListItem", position: i + 1, name: v.name, url: abs(v.path) })) },
        },
        { "@context": "https://schema.org", ...breadcrumb(crumbs) },
      ],
    };
  }
  const crumbs = [HOME, PROJECTS, { name: p.name!, path: p.path }];
  return {
    ...p,
    crumbs,
    jsonld: [
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: p.name,
        url: abs(p.path),
        description: p.description,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Any (web browser)",
        browserRequirements: "Requires JavaScript",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        about: p.app!.about,
        author: personRef,
        inLanguage: "en",
        dateModified: UPDATED,
        isPartOf: { "@id": SITE_ID },
      },
      { "@context": "https://schema.org", ...breadcrumb(crumbs) },
    ],
  };
}

/** Method notes: a technical article about the project, linked to it. */
export function methodSeo(n: { title: string; abstract: string; projectPath: string; changelog: { date: string }[] }, slug: string): Seo {
  const project = PAGES[slug];
  const path = `${n.projectPath}method/`;
  const crumbs = [HOME, PROJECTS, { name: project.name!, path: n.projectPath }, { name: "Method note", path }];
  const description = n.abstract.length > 155 ? `${n.abstract.slice(0, 152).replace(/\s+\S*$/, "")}...` : n.abstract;
  return {
    title: `${project.name} method note | David Lindgreen`,
    description,
    image: project.image,
    crumbs,
    type: "article",
    jsonld: [
      {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: n.title,
        description: n.abstract,
        url: abs(path),
        mainEntityOfPage: abs(path),
        author: personRef,
        inLanguage: "en",
        datePublished: "2026-11-01",
        dateModified: n.changelog[0].date,
        isPartOf: { "@type": "WebApplication", name: project.name, url: abs(project.path) },
      },
      { "@context": "https://schema.org", ...breadcrumb(crumbs) },
    ],
  };
}
