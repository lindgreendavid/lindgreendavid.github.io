// Browser behaviour for the research assistant page. Filing text is untrusted: it is only ever inserted as text nodes, never as HTML.
import type { Dataset } from "../pharma/model.ts";
import { ask } from "./ask.ts";
import { companiesIn } from "./calc.ts";
import type { Answer } from "./ask.ts";
import { buildIndex, tokenize } from "./search.ts";
import type { Hit, Index, Passage } from "./search.ts";

export type FilingInfo = Record<string, { name: string; url: string; filed: string; accession: string }>;

const KEYS = ["novartis", "astrazeneca", "gsk"];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Appends `text` to `parent`, wrapping occurrences of the query words in <mark>. Uses text nodes only. */
function highlight(parent: HTMLElement, text: string, words: string[]) {
  if (!words.length) return void parent.append(text);
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  text.split(re).forEach((part, i) => {
    if (i % 2) parent.append(el("mark", undefined, part));
    else if (part) parent.append(part);
  });
}

function passageCard(h: Hit, filings: FilingInfo, words: string[], rank: number): HTMLElement {
  const f = filings[h.passage.company];
  const card = el("article", "passage");
  const head = el("header");
  head.append(el("span", "rank", `#${rank}`), el("strong", undefined, f.name), el("span", "sect", h.passage.section));
  const body = el("div", "ptext");
  highlight(body, h.passage.text, words);
  const foot = el("p", "pfoot");
  const a = el("a", undefined, "Open this place in the filing on sec.gov");
  a.href = h.passage.anchor ? `${f.url}#${encodeURIComponent(h.passage.anchor)}` : f.url;
  a.rel = "noopener noreferrer";
  foot.append(`Form 20-F filed ${f.filed} · `, a);
  card.append(head, body, foot);
  return card;
}

export function render(out: HTMLElement, a: Answer, q: string, filings: FilingInfo, ms: number) {
  out.replaceChildren();
  const words = [...new Set(q.toLowerCase().match(/[a-z0-9][a-z0-9.%-]{2,}/g) ?? [])].filter((w) => tokenize(w).length && !companiesIn(w).length);
  if (a.kind === "calc") {
    const box = el("div", "answer calc");
    box.append(el("p", "kind", "Calculated answer · no language model"), el("p", "big", a.text));
    const steps = el("ul");
    a.steps.forEach((s) => steps.append(el("li", undefined, s)));
    box.append(steps);
    if (a.rows.length > 1) {
      const t = el("table", "tbl");
      const tb = el("tbody");
      a.rows.forEach((r) => {
        const tr = el("tr");
        tr.append(el("th", undefined, r.company), el("td", undefined, r.value));
        tb.append(tr);
      });
      t.append(el("caption", "sr", "Values for each company"), tb);
      box.append(t);
    }
    const p = el("p", "muted");
    const link = el("a", undefined, "How the dataset was checked");
    link.href = "/projects/pharma-valuation/#evidence";
    p.append(`Computed from the reconciled dataset (${a.basis}). `, link, ".");
    box.append(p);
    out.append(box);
  } else if (a.kind === "refusal") {
    const box = el("div", "answer refusal");
    box.append(el("p", "kind", `No answer from the reports · ${a.reason.replace("-", " ")}`), el("p", "big", a.message));
    if (a.nearest?.length) {
      const d = el("details");
      d.append(el("summary", undefined, "Show the nearest passages anyway"));
      a.nearest.forEach((h, i) => d.append(passageCard(h, filings, words, i + 1)));
      box.append(d);
    }
    out.append(box);
  } else {
    const box = el("div", "answer");
    box.append(el("p", "kind", `Source passages · ranked by keyword match (BM25) · no generated text · ${ms} ms`));
    a.hits.forEach((h, i) => box.append(passageCard(h, filings, words, i + 1)));
    box.append(el("p", "muted", "The passages are quoted from the filing. Check the top result against the filing before relying on it: keyword ranking can put a related passage first."));
    out.append(box);
  }
}

export function initResearch(ds: Dataset, filings: FilingInfo) {
  const form = document.getElementById("ask-form") as HTMLFormElement | null;
  const input = document.getElementById("ask-q") as HTMLInputElement | null;
  const out = document.getElementById("ask-out");
  const status = document.getElementById("ask-status");
  if (!form || !input || !out || !status) return;
  let index: Promise<Index> | undefined;
  const load = () =>
    (index ??= Promise.all(KEYS.map((c) => fetch(`/research/passages-${c}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${c}: HTTP ${r.status}`)))))).then((files) => {
      const passages: Passage[] = files.flatMap((rows: [number, string, string, string][], i) => rows.map(([id, section, anchor, text]) => ({ id, company: KEYS[i], section, anchor, text })));
      return buildIndex(passages);
    }));
  const run = async (q: string) => {
    q = q.trim();
    if (!q) return;
    status.textContent = "Loading the three reports (about 2.8 MB, once)…";
    try {
      const ix = await load();
      const t0 = performance.now();
      const answer = ask(q, ix, ds);
      status.textContent = "";
      render(out, answer, q, filings, Math.round(performance.now() - t0));
    } catch (e) {
      index = undefined;
      status.textContent = "The reports could not be loaded. Check your connection and try again.";
    }
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void run(input.value);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) =>
    b.addEventListener("click", () => {
      input.value = b.dataset.q ?? "";
      void run(input.value);
    }),
  );
}
