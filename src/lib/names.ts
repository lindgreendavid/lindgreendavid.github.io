// Company-name tidying shared by the pages and the build tools (no data imports, so Node can load it directly).
// The dataset's names contain non-breaking spaces, so match any whitespace.
export const nice = (n: string) => {
  const t = n.replace(/,?\s+(Inc|Corp|Corporation|plc|Ltd)\.?$/i, "").replace(/\s+Holdings$/i, "").replace(/\s+(Pharmaceuticals|Pharma|Therapeutics)$/i, "");
  return t.split(/\s+/).map((w, k) => (k === 0 && w.length <= 3 ? w.toUpperCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");
};
