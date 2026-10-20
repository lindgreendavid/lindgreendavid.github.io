// Retrieval over the filing passages: BM25 with a small stop list and a coverage check used to decide when to refuse.
// Dependency-free so it runs at build time, in the browser and under `node --test`.

export type Passage = { id: number; company: string; section: string; anchor: string; text: string };
export type Hit = { passage: Passage; score: number; coverage: number; index: number; /** The query's rarest term (highest idf) and whether this passage contains it. */ anchor?: { term: string; present: boolean } };
export type Index = { passages: Passage[]; tf: Map<string, number>[]; len: number[]; avgLen: number; df: Map<string, number>; byCompany: Map<string, number[]> };

const STOP = new Set(
  "a an and are as at be by did do does for from had has have how in is it its of on or per than that the their there this to was were what when where which who whom why with year years fiscal company reported report annual according stated state say says give tell many much long often exactly also would could can may our you".split(" "),
);

/** Lowercase alphanumeric tokens with a light plural/suffix stem; numbers keep their digits ("1,234" -> "1234"). */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.toLowerCase().replace(/(\d),(\d)/g, "$1$2").match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? []) {
    if (STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

function stem(w: string): string {
  if (/^\d/.test(w) || w.length < 5) return w;
  let r = w;
  if (r.endsWith("ies")) r = r.slice(0, -3) + "y";
  else if (r.length > 7 && /ations?$/.test(r)) r = r.replace(/ations?$/, "at");
  else if (r.length > 6 && /ions?$/.test(r)) r = r.replace(/ions?$/, "");
  else if (r.length > 6 && r.endsWith("ing")) r = r.slice(0, -3);
  else if (r.length > 5 && r.endsWith("ed")) r = r.slice(0, -2);
  else if (r.length > 5 && r.endsWith("es")) r = r.slice(0, -2);
  else if (r.endsWith("s") && !r.endsWith("ss")) r = r.slice(0, -1);
  // "declare" and "declared" must meet: drop a trailing silent e last.
  if (r.length > 5 && r.endsWith("e")) r = r.slice(0, -1);
  return r;
}

export function buildIndex(passages: Passage[]): Index {
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  const byCompany = new Map<string, number[]>();
  passages.forEach((p, i) => {
    // The section path is searchable too: headings are good evidence of topic.
    const toks = tokenize(`${p.section} ${p.section} ${p.text}`);
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    tf.push(m);
    len.push(toks.length);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    byCompany.set(p.company, [...(byCompany.get(p.company) ?? []), i]);
  });
  return { passages, tf, len, avgLen: len.reduce((a, b) => a + b, 0) / Math.max(1, len.length), df, byCompany };
}

const K1 = 1.4;
const B = 0.75;

export function idf(ix: Index, term: string): number {
  const n = ix.df.get(term) ?? 0;
  return Math.log(1 + (ix.passages.length - n + 0.5) / (n + 0.5));
}

/** Ranked passages. `coverage` is the share of the query's idf mass that appears in the passage (0 to 1). */
export function search(ix: Index, query: string, o: { company?: string; k?: number } = {}): Hit[] {
  // Terms that appear nowhere in the corpus still count against coverage: a question about something the reports never mention must not look covered.
  const qt = [...new Set(tokenize(query))];
  if (!qt.length) return [];
  const weights = qt.map((t) => idf(ix, t));
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const pool = o.company ? (ix.byCompany.get(o.company) ?? []) : ix.passages.map((_, i) => i);
  const hits: Hit[] = [];
  for (const i of pool) {
    const m = ix.tf[i];
    let score = 0;
    let cov = 0;
    qt.forEach((t, j) => {
      const f = m.get(t);
      if (!f) return;
      score += weights[j] * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * ix.len[i]) / ix.avgLen)));
      cov += weights[j];
    });
    if (score > 0) hits.push({ passage: ix.passages[i], score, coverage: cov / totalW, index: i });
  }
  hits.sort((a, b) => b.score - a.score);
  const rarest = qt.filter((t) => !/^\d+$/.test(t)).sort((a, b) => idf(ix, b) - idf(ix, a))[0];
  const top = hits.slice(0, o.k ?? 5);
  if (rarest) for (const h of top) h.anchor = { term: rarest, present: ix.tf[h.index].has(rarest) };
  return top;
}
