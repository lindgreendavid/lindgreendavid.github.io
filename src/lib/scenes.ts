// Data for the scroll scenes, computed from the same models as the tools on each page.
import type { LboInputs, LboResult } from "./lbo/model.ts";
import type { DcfResult } from "./pharma/model.ts";
import type { Compact, Options } from "./credit/model.ts";
import { DEFAULT_OPTIONS, rowFor } from "./credit/model.ts";
import { compareBriefs } from "./ma/screen.ts";
import type { Dataset } from "./ma/screen.ts";
import { nice } from "./names.ts";

/** Debt and equity at close and after each year, with the enterprise value held at the entry multiple so only the deleveraging moves. */
export function lboSceneData(i: LboInputs, r: LboResult) {
  const cols = [{ label: "Close", senior: r.senior0, sub: r.sub0, cash: 0, ebitda: i.ebitda0 }, ...r.years.map((y) => ({ label: `Year ${y.year}`, senior: y.senior, sub: y.sub, cash: y.cash, ebitda: y.ebitda }))].map((c) => {
    const ev = i.entryMultiple * c.ebitda;
    const netDebt = c.senior + c.sub - c.cash;
    return { label: c.label, senior: c.senior, sub: c.sub, equity: ev - netDebt, ev, lev: netDebt / c.ebitda };
  });
  return { cols, max: Math.max(...cols.map((c) => c.ev)), entry: i.entryMultiple, sponsorEquity: r.sponsorEquity };
}

/** Each company's stressed score as EBITDA falls from 0 to 60 percent. */
export function creditSceneData(ks: Compact[]) {
  const shocks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const per = shocks.map((s) => ks.map((k) => rowFor(k, 2025, { ...DEFAULT_OPTIONS, shock: s } as Options)));
  const keep = ks.map((_, idx) => per.every((rows) => rows[idx].score !== null && rows[idx].stressedScore !== null));
  const order = ks.map((_, idx) => idx).filter((idx) => keep[idx]).sort((a, b) => (per[0][b].score as number) - (per[0][a].score as number));
  return {
    shocks,
    tickers: order.map((idx) => ks[idx].ticker),
    // score at shock 0 is the unstressed score; later columns are the stressed score at that shock
    scores: shocks.map((s, j) => order.map((idx) => (s === 0 ? (per[0][idx].score as number) : (per[j][idx].stressedScore as number)))),
  };
}

/** The five forecast years and everything after them, as cash flow, present value and share of enterprise value. */
export function pharmaSceneData(r: DcfResult) {
  const tiles = [...r.years.map((y, k) => ({ label: `Year ${k + 1}`, cash: y.fcff, pv: y.pv })), { label: "After year 5", cash: r.terminalValue, pv: r.pvTerminalValue }];
  return { tiles, ev: r.enterpriseValue, tvShare: r.terminalShareOfEv };
}

/** Top five under each of the three buyer briefs, as ranks per brief for every company that appears. */
export function maSceneData(ds: Dataset) {
  const c = compareBriefs(ds, undefined, 5);
  const tickers: string[] = [];
  const names: Record<string, string> = {};
  for (const b of c.results) for (const t of b.top) if (!tickers.includes(t.ticker)) (tickers.push(t.ticker), (names[t.ticker] = nice(t.name)));
  const ranks = tickers.map((t) => c.results.map((b) => b.top.find((x) => x.ticker === t)?.rank ?? null));
  return { briefs: c.results.map((b) => ({ name: b.brief.name, summary: b.brief.summary })), tickers, names, ranks };
}
