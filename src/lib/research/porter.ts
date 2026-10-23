// Porter stemmer (M. F. Porter, 1980), the standard algorithm, written out in TypeScript. Dependency-free.
// Used by the v2 search engine so "acquired", "acquires" and "acquiring" share a stem.

const step2: Record<string, string> = {
  ational: "ate", tional: "tion", enci: "ence", anci: "ance", izer: "ize", bli: "ble", alli: "al", entli: "ent", eli: "e", ousli: "ous",
  ization: "ize", ation: "ate", ator: "ate", alism: "al", iveness: "ive", fulness: "ful", ousness: "ous", aliti: "al", iviti: "ive", biliti: "ble", logi: "log",
};
const step3: Record<string, string> = { icate: "ic", ative: "", alize: "al", iciti: "ic", ical: "ic", ful: "", ness: "" };

const isCons = (w: string, i: number): boolean => {
  const c = w[i];
  if ("aeiou".includes(c)) return false;
  if (c === "y") return i === 0 ? true : !isCons(w, i - 1);
  return true;
};
/** m in Porter's notation: the number of VC sequences in the stem. */
const measure = (s: string): number => {
  let n = 0;
  let i = 0;
  const L = s.length;
  while (i < L && isCons(s, i)) i++;
  while (i < L) {
    while (i < L && !isCons(s, i)) i++;
    if (i >= L) break;
    n++;
    while (i < L && isCons(s, i)) i++;
  }
  return n;
};
const hasVowel = (s: string) => [...s].some((_, i) => !isCons(s, i));
const endsDouble = (s: string) => s.length >= 2 && s[s.length - 1] === s[s.length - 2] && isCons(s, s.length - 1);
const cvc = (s: string) => {
  const n = s.length;
  if (n < 3) return false;
  return isCons(s, n - 3) && !isCons(s, n - 2) && isCons(s, n - 1) && !"wxy".includes(s[n - 1]);
};

export function porter(word: string): string {
  let w = word.toLowerCase();
  if (w.length < 3 || /\d/.test(w)) return w;

  // step 1a
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -2);
  else if (!w.endsWith("ss") && w.endsWith("s")) w = w.slice(0, -1);

  // step 1b
  let flag = false;
  if (w.endsWith("eed")) {
    if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
  } else if (w.endsWith("ed") && hasVowel(w.slice(0, -2))) {
    w = w.slice(0, -2);
    flag = true;
  } else if (w.endsWith("ing") && hasVowel(w.slice(0, -3))) {
    w = w.slice(0, -3);
    flag = true;
  }
  if (flag) {
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) w += "e";
    else if (endsDouble(w) && !"lsz".includes(w[w.length - 1])) w = w.slice(0, -1);
    else if (measure(w) === 1 && cvc(w)) w += "e";
  }

  // step 1c
  if (w.endsWith("y") && hasVowel(w.slice(0, -1))) w = w.slice(0, -1) + "i";

  // step 2 and 3
  const apply = (table: Record<string, string>) => {
    for (const suf of Object.keys(table).sort((a, b) => b.length - a.length)) {
      if (w.endsWith(suf)) {
        const stem = w.slice(0, -suf.length);
        if (measure(stem) > 0) w = stem + table[suf];
        return;
      }
    }
  };
  apply(step2);
  apply(step3);

  // step 4
  const s4 = ["al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement", "ment", "ent", "ion", "ou", "ism", "ate", "iti", "ous", "ive", "ize"];
  for (const suf of s4.sort((a, b) => b.length - a.length)) {
    if (w.endsWith(suf)) {
      const stem = w.slice(0, -suf.length);
      if (measure(stem) > 1 && (suf !== "ion" || /[st]$/.test(stem))) w = stem;
      break;
    }
  }

  // step 5
  if (w.endsWith("e")) {
    const stem = w.slice(0, -1);
    const m = measure(stem);
    if (m > 1 || (m === 1 && !cvc(stem))) w = stem;
  }
  if (measure(w) > 1 && endsDouble(w) && w.endsWith("l")) w = w.slice(0, -1);
  return w;
}
