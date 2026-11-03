# David Lindgreen: portfolio site

Source of [lindgreendavid.com](https://lindgreendavid.com): a personal portfolio and five finance projects built on public SEC and ECB data. Lab Notes, the research write-ups, lives in a separate repository ([blog](https://github.com/lindgreendavid/blog), live at [notes.lindgreendavid.com](https://notes.lindgreendavid.com)).

## The five projects

| Project | What it does | Live | Method note |
|---|---|---|---|
| Pharma Valuation Explorer | Compares Novartis, AstraZeneca and GSK, then values AstraZeneca with a DCF | [Open](https://lindgreendavid.com/projects/pharma-valuation/) | [Method](https://lindgreendavid.com/projects/pharma-valuation/method/) |
| LBO Workbench | A leveraged buyout on SEC 10-K figures: sources and uses, debt schedule, IRR, MOIC | [Open](https://lindgreendavid.com/projects/lbo-workbench/) | [Method](https://lindgreendavid.com/projects/lbo-workbench/method/) |
| Credit Risk Screen | Scores 28 US pharma and biotech companies, with a stress test and Altman Z cross-check | [Open](https://lindgreendavid.com/projects/credit-risk-screen/) | [Method](https://lindgreendavid.com/projects/credit-risk-screen/method/) |
| M&A Screening Workbench | Screens the same companies against a hypothetical buyer brief | [Open](https://lindgreendavid.com/projects/ma-screening/) | [Method](https://lindgreendavid.com/projects/ma-screening/method/) |
| Annual-Report Research Assistant | Answers questions about 20-F filings with sources, calculations or refusals | [Open](https://lindgreendavid.com/projects/research-assistant/) | [Method](https://lindgreendavid.com/projects/research-assistant/method/) |

They are educational: not investment advice, not credit ratings, not valuations of any company, and not independently reviewed. Built with AI assistance (Claude); David Lindgreen designed and directed them and is responsible for checking them. Each method note lists what was not checked.

## How it is built

Astro (static output), plain CSS with light and dark tokens, TypeScript with no framework for the models, and a self-hosted variable font. The 3D hero chart uses three.js, and the scroll and motion layer uses GSAP and Lenis; they are bundled into the site and loaded only where needed. No analytics, cookies or third-party scripts.

```
src/pages/            pages: home, projects, method notes, legal, 404, sitemap.xml
src/lib/<project>/    the models and their browser code (pure functions, no I/O)
src/lib/seo.ts        titles, descriptions and structured data for every page
src/data/             site facts, datasets from SEC filings, evaluation results
tools/                scripts that fetch and validate the data and build the Excel files
tests/                unit tests (node:test)
public/downloads/     Excel models and data files offered on the project pages
```

## Run it

Needs Node 24 or later.

```bash
npm install
npm run dev      # http://localhost:4321
npm test         # 117 unit tests
npm run build    # static site in dist/
```

The raw SEC files are not stored in the repository; the scripts in `tools/` download them with a declared contact in the User-Agent, as the SEC asks. Each project's method note has its exact reproduction commands.

## Deployment

GitHub Pages, from `.github/workflows/deploy.yml` on every push to `main`.

## Contact

David Lindgreen, Frankfurt, Germany: [lindgreendavid@gmail.com](mailto:lindgreendavid@gmail.com) · [LinkedIn](https://www.linkedin.com/in/david-lindgreen-625868303/)
