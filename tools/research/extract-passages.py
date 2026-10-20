"""Turn the FY2025 Form 20-F HTML files in data-raw/ into searchable passages (standard library only).

Each passage keeps: company, section path (nearest headings), the nearest element id in the filing (so a link can jump to
that spot with `#id`), and text. Page numbers are not used: the SEC HTML has no reliable printed page numbers.
Run: python -I tools/research/extract-passages.py   (writes public/research/passages-*.json and src/data/research/filings.json)
"""
import json
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-raw"
OUT = ROOT / "src" / "data" / "research"
PUB = ROOT / "public" / "research"  # passages are fetched by the browser on first question

FILINGS = {
    "novartis": {"name": "Novartis", "file": "novartis-20f-2025.htm", "cik": 1114448, "accn": "0001114448-26-000004", "doc": "nvs-20251231.htm", "filed": "2026-02-04"},
    "astrazeneca": {"name": "AstraZeneca", "file": "astrazeneca-20f-2025.htm", "cik": 901832, "accn": "0001104659-26-019130", "doc": "azn-20251231x20f.htm", "filed": "2026-02-24"},
    "gsk": {"name": "GSK", "file": "gsk-20f-2025.htm", "cik": 1131399, "accn": "0001131399-26-000004", "doc": "gsk-20251231.htm", "filed": "2026-03-06"},
}

BLOCK = {"p", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br", "table", "section", "article", "ul", "ol", "hr"}
SKIP = {"script", "style", "head", "title"}
MAX_CHARS = 1100
MIN_CHARS = 60


class Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []  # dicts: text, size, bold, anchor
        self.cur = []  # chunks (text, size, bold)
        self.cur_anchor = None
        self.last_id = None
        self.skip = 0
        self.hidden = 0
        self.stack = []  # (tag, size, bold) for inline styles
        self.table_depth = 0
        self.cells = []
        self.cell = []

    def _style(self, attrs):
        d = dict(attrs)
        st = (d.get("style") or "").lower()
        m = re.search(r"font-size:\s*([\d.]+)pt", st)
        size = float(m.group(1)) if m else None
        bold = bool(re.search(r"font-weight:\s*(bold|[6-9]00)", st))
        return size, bold, d

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
            return
        if tag == "ix:header":
            self.hidden += 1
        size, bold, d = self._style(attrs)
        if d.get("id"):
            self.last_id = d["id"]
            if self.cur_anchor is None:
                self.cur_anchor = d["id"]
        if tag == "table":
            self.flush()
            self.table_depth += 1
        if tag in ("td", "th"):
            self.flush_cell()
        if tag == "tr":
            self.flush()
        elif tag in BLOCK and tag != "table":
            if self.table_depth:
                self.cur.append((" ", None, False))
            else:
                self.flush()
        if tag in ("b", "strong"):
            bold = True
        self.stack.append((tag, size, bold))

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
            return
        if tag == "ix:header":
            self.hidden = max(0, self.hidden - 1)
        if tag in ("td", "th"):
            self.flush_cell()
        if tag == "tr":
            self.flush_row()
        elif tag == "table":
            self.table_depth = max(0, self.table_depth - 1)
            self.flush()
        elif tag in BLOCK:
            if self.table_depth:
                self.cur.append((" ", None, False))
            else:
                self.flush()
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def cur_style(self):
        size = next((s for _, s, _ in reversed(self.stack) if s), None)
        bold = any(b for _, _, b in self.stack)
        return size, bold

    def handle_data(self, data):
        if self.skip or self.hidden:
            return
        t = re.sub(r"\s+", " ", data.replace("\xa0", " ").replace("​", ""))
        if not t.strip():
            if self.cur and not self.cur[-1][0].endswith(" "):
                self.cur.append((" ", None, False))
            return
        size, bold = self.cur_style()
        self.cur.append((t, size, bold))

    def flush_cell(self):
        text = "".join(c[0] for c in self.cur).strip()
        self.cur = []
        if text:
            self.cell.append(text)

    def flush_row(self):
        self.flush_cell()
        cells = [c for c in self.cell if c not in ("$", "%", ")", "(")]
        self.cell = []
        if cells:
            self.blocks.append({"text": " | ".join(cells), "size": None, "bold": False, "anchor": self.cur_anchor or self.last_id, "row": True})
        self.cur_anchor = None

    def flush(self):
        if not self.cur:
            self.cur_anchor = None
            return
        text = "".join(c[0] for c in self.cur).strip()
        weights = Counter()
        bold_chars = 0
        for t, size, bold in self.cur:
            n = len(t.strip())
            if size:
                weights[size] += n
            if bold:
                bold_chars += n
        total = sum(len(c[0].strip()) for c in self.cur) or 1
        size = weights.most_common(1)[0][0] if weights else None
        self.cur = []
        if text:
            self.blocks.append({"text": text, "size": size, "bold": bold_chars / total > 0.8, "anchor": self.cur_anchor or self.last_id, "row": False})
        self.cur_anchor = None


def passages_for(key, meta):
    p = Extractor()
    p.feed((RAW / meta["file"]).read_text(encoding="utf-8", errors="replace"))
    p.flush()
    blocks = p.blocks
    body = Counter()
    for b in blocks:
        if b["size"] and len(b["text"]) > 80:
            body[b["size"]] += len(b["text"])
    body_size = body.most_common(1)[0][0]

    def is_heading(b):
        t = b["text"]
        if b["row"] or len(t) > 110 or len(t) < 4 or re.search(r"continued|^(total|note|notes)\b", t, re.I):
            return False
        if re.fullmatch(r"[\d\s.,%()$£€|-]+", t) or t.endswith((".", ",", ";")) and not re.match(r"(Item|\d+\.[A-Z])", t):
            return False
        big = b["size"] is not None and b["size"] >= body_size + 1.5
        return big or (b["bold"] and len(t) < 90)

    out = []
    section = ["Front matter"]
    buf, buf_anchor, buf_len = [], None, 0

    def emit():
        nonlocal buf, buf_anchor, buf_len
        text = "\n".join(buf).strip()
        if len(text) >= MIN_CHARS:
            out.append({"section": " › ".join(section[-2:]), "anchor": buf_anchor, "text": text})
        buf, buf_anchor, buf_len = [], None, 0

    for b in blocks:
        if is_heading(b):
            emit()
            big = b["size"] is not None and b["size"] >= body_size + 1.5
            if big:
                section = section[:1] if len(section) > 1 else section
                section = [b["text"]] if True else section
            else:
                section = section[:1] + [b["text"]]
            continue
        if buf_len + len(b["text"]) > MAX_CHARS and buf:
            emit()
        if buf_anchor is None:
            buf_anchor = b["anchor"]
        buf.append(b["text"])
        buf_len += len(b["text"])
    emit()
    return out, body_size, len(blocks)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PUB.mkdir(parents=True, exist_ok=True)
    meta_out = {}
    for key, meta in FILINGS.items():
        ps, body_size, nblocks = passages_for(key, meta)
        url = f"https://www.sec.gov/Archives/edgar/data/{meta['cik']}/{meta['accn'].replace('-', '')}/{meta['doc']}"
        rows = [[i, p["section"], p["anchor"] or "", p["text"]] for i, p in enumerate(ps)]
        (PUB / f"passages-{key}.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        meta_out[key] = {"name": meta["name"], "accession": meta["accn"], "filed": meta["filed"], "url": url, "passages": len(ps), "chars": sum(len(p["text"]) for p in ps), "bodyFontPt": body_size}
        print(key, "blocks", nblocks, "passages", len(ps), "chars", meta_out[key]["chars"], "body pt", body_size, file=sys.stderr)
    (OUT / "filings.json").write_text(json.dumps(meta_out, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
