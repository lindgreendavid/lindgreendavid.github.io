// Retrieval engine v2. Same job as search.ts (BM25 over passages) with three additions aimed at paraphrased questions:
//   1. Porter stemming, so word forms meet;
//   2. a hand-written thesaurus (thesaurus.ts), so synonyms count as the same idea at a discount;
//   3. optional corpus-derived neighbours (expansion.json, built by tools/research/build-expansion.ts), at a larger discount.
// Each question term is a concept: a passage is scored on the best-matching alternative for that concept, so expansion
// cannot count the same idea twice. v1 (search.ts) is kept unchanged as the baseline.
import { GROUPS } from "./thesaurus.ts";
import { porter } from "./porter.ts";
import type { Passage } from "./search.ts";

export type Neighbours = Record<string, [string, number][]>;
export type Index2 = {
  passages: Passage[];
  tf: Map<string, number>[];
  len: number[];
  avgLen: number;
  df: Map<string, number>;
  byCompany: Map<string, number[]>;
  syn: Map<string, Set<string>>;
  nb: Neighbours;
  /** Token sequences, for the adjacent-pair (phrase) bonus. */
  seq: string[][];
};
export type Hit2 = { passage: Passage; score: number; coverage: number; index: number };

const STOP = new Set(
  "a an and are as at be been being by did do does for from had has have how in is it its of on or per than that the their there this to was were what when where which who whom whose why with year years fiscal company reported report annual according stated state say says give tell many much long often exactly also would could can may our you we they them these those into over under about between during after before while within without not no yes if then so such any each both other another more most some very just only own same too s t".split(" "),
);

export function tokenize2(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.toLowerCase().replace(/(\d),(\d)/g, "$1$2").match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? []) {
    if (STOP.has(raw)) continue;
    out.push(porter(raw));
  }
  return out;
}

function buildSynonyms(): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const g of GROUPS) {
    const stems = [...new Set(g.flatMap((w) => tokenize2(w)))];
    for (const a of stems) for (const b of stems) if (a !== b) (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b);
  }
  return m;
}

export function buildIndex2(passages: Passage[], nb: Neighbours = {}): Index2 {
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  const byCompany = new Map<string, number[]>();
  const seq: string[][] = [];
  passages.forEach((p, i) => {
    const toks = tokenize2(`${p.section} ${p.section} ${p.text}`);
    seq.push(tokenize2(p.text));
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    tf.push(m);
    len.push(toks.length);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    byCompany.set(p.company, [...(byCompany.get(p.company) ?? []), i]);
  });
  return { passages, tf, len, avgLen: len.reduce((a, b) => a + b, 0) / Math.max(1, len.length), df, byCompany, syn: buildSynonyms(), nb, seq };
}

const K1 = 1.4;
const B = 0.75;
export const W_SYN = 0.6;
export const W_NB = 0.35;
/** Bonus for two adjacent question terms appearing next to each other (one word in between allowed) in the passage, as a share of their idf. */
export const W_PHRASE = 0.5;

const idf2 = (ix: Index2, t: string) => {
  const n = ix.df.get(t) ?? 0;
  return Math.log(1 + (ix.passages.length - n + 0.5) / (n + 0.5));
};

type Concept = { term: string; idf: number; alts: [string, number][] };

export function concepts(ix: Index2, query: string): Concept[] {
  const terms = [...new Set(tokenize2(query))];
  return terms.map((t) => {
    const alts = new Map<string, number>([[t, 1]]);
    for (const s of ix.syn.get(t) ?? []) if (ix.df.has(s) && !alts.has(s)) alts.set(s, W_SYN);
    for (const [s, sim] of ix.nb[t] ?? []) if (ix.df.has(s) && !alts.has(s)) alts.set(s, W_NB * Math.min(1, sim / 0.6));
    return { term: t, idf: idf2(ix, t), alts: [...alts] };
  });
}

/** Ranked passages. `coverage` is the share of the question's idf mass whose concept appears in the passage, discounted for synonyms and neighbours. */
export function search2(ix: Index2, query: string, o: { company?: string; k?: number } = {}): Hit2[] {
  const cs = concepts(ix, query);
  if (!cs.length) return [];
  const totalW = cs.reduce((a, c) => a + c.idf, 0) || 1;
  const qseq = tokenize2(query);
  const pool = o.company ? (ix.byCompany.get(o.company) ?? []) : ix.passages.map((_, i) => i);
  const hits: Hit2[] = [];
  for (const i of pool) {
    const m = ix.tf[i];
    let score = 0;
    let cov = 0;
    for (const c of cs) {
      let best = 0;
      let bestW = 0;
      for (const [a, w] of c.alts) {
        const f = m.get(a);
        if (!f) continue;
        const idfA = c.idf; // the concept keeps the question term's weight, so a rare question word stays important
        const s = w * idfA * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * ix.len[i]) / ix.avgLen)));
        if (s > best) best = s;
        if (w > bestW) bestW = w;
      }
      score += best;
      cov += c.idf * bestW;
    }
    // Phrase bonus: adjacent question terms that also sit together in the passage.
    const sq = ix.seq[i];
    for (let k = 0; k + 1 < qseq.length; k++) {
      const a = qseq[k];
      const b = qseq[k + 1];
      for (let j = 0; j < sq.length - 1; j++) {
        if (sq[j] === a && (sq[j + 1] === b || sq[j + 2] === b)) {
          score += W_PHRASE * (idf2(ix, a) + idf2(ix, b)) * 0.5;
          break;
        }
      }
    }
    if (score > 0) hits.push({ passage: ix.passages[i], score, coverage: cov / totalW, index: i });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, o.k ?? 5);
}
