// Which companies can be bought in the LBO model, and which one is shown first. Shared by the page and the workbook builder.
import { DEFAULT_FILTERS, DEFAULT_OPTIONS, DEFAULT_WEIGHTS, applyFilters, buildRows, metricsFor, rank, score } from "../ma/screen.ts";
import type { Dataset } from "../ma/screen.ts";
import { nice } from "../names.ts";
import type { Target } from "./ui.ts";

/** Every company with the figures an LBO needs: revenue, positive EBITDA, D&A and net debt. */
export function buildTargets(data: Dataset): Target[] {
  return Object.values(data.companies)
    .map((c) => {
      const { m, flags } = metricsFor(c, DEFAULT_OPTIONS);
      const da = c.years["2025"].da?.value ?? null;
      if (m.revenue === null || m.ebitda === null || m.ebitda <= 0 || m.netDebt === null || da === null || m.revenue <= 0) return null;
      return { ticker: c.ticker, name: nice(c.name), revenue: m.revenue, ebitda: m.ebitda, da, netDebt: m.netDebt, flags } as Target;
    })
    .filter((t): t is Target => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The highest-ranked company in the default screen with no identified one-offs or royalty financing, so the first view is not distorted. */
export function defaultTarget(data: Dataset, targets: Target[]): Target {
  const ranked = rank(score(applyFilters(buildRows(data, DEFAULT_OPTIONS), DEFAULT_FILTERS).passed, DEFAULT_WEIGHTS));
  const clean = (t: string) => !data.companies[t].oneOffs?.length && !data.companies[t].debtLikeItems?.length;
  for (const r of ranked) {
    const t = targets.find((x) => x.ticker === r.ticker);
    if (t && clean(t.ticker)) return t;
  }
  return targets[0];
}
