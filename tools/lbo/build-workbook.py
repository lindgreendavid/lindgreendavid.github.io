"""Builds the downloadable Excel LBO model from src/data/lbo/reference.json (written by tools/lbo/export-reference.ts).
Inputs are blue; everything else is a live formula. A Checks sheet tests identities. The sensitivity grids are pasted values from the web model
(Excel data tables cannot be written by this library), and the sheet says so.
Run: node tools/lbo/export-reference.ts && python tools/lbo/build-workbook.py && powershell tools/lbo/recalc-workbook.ps1"""
import json
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

ROOT = Path(__file__).resolve().parents[2]
ref = json.loads((ROOT / "src/data/lbo/reference.json").read_text(encoding="utf-8"))
OUT = ROOT / "public/downloads/lbo-workbench"
OUT.mkdir(parents=True, exist_ok=True)

BLUE = Font(color="0000FF")
BOLD = Font(bold=True)
HEAD = PatternFill("solid", fgColor="E1EEE6")
INPUT = PatternFill("solid", fgColor="FFF8DC")
t, inp = ref["target"], ref["inputs"]

wb = Workbook()

# ------------------------------------------------------------------ README
ws = wb.active
ws.title = "README"
lines = [
    ("LBO Workbench: model workbook", BOLD),
    (f"Generated {ref['generated']} from public SEC XBRL data (Form 10-K, FY2025). Company: {t['name']} ({t['ticker']}). A hypothetical deal for learning; not a bid, valuation or advice.", None),
    ("", None),
    ("Sheets", BOLD),
    ("Inputs: starting figures from the filing and every assumption (blue on cream = input). Model: five-year projection and debt schedule, all formulas. Deal: sources and uses, exit, MOIC, IRR and the value bridge. Sensitivity: pasted values from the web model. Checks: identities that must be TRUE.", None),
    ("", None),
    ("How it works", BOLD),
    ("Enterprise value = entry multiple x FY2025 EBITDA. Uses = enterprise value + fees. Sources = senior and subordinated debt (multiples of EBITDA) + sponsor equity (the remainder). Interest is charged on opening balances (no circularity). The senior debt has a mandatory repayment and a cash sweep; the subordinated debt is repaid at exit. IRR = MOIC^(1/5) - 1 because there are no interim payments.", None),
    ("", None),
    ("Limits", BOLD),
    ("Hypothetical: the entry price, exit multiple, loan terms and operating assumptions are illustrative inputs, not market data. EBITDA is as reported, with no adjustments. No revolver, minimum cash, interest-deductibility limit, fee amortisation, management equity or purchase-price accounting. Built with AI assistance; recalculated in Excel and compared with the web model; not independently reviewed.", None),
]
for n, (text, font) in enumerate(lines, start=1):
    c = ws.cell(row=n, column=1, value=text)
    c.alignment = Alignment(wrap_text=True, vertical="top")
    if font:
        c.font = font
ws.column_dimensions["A"].width = 130

# ------------------------------------------------------------------ Inputs
wi = wb.create_sheet("Inputs")
wi.column_dimensions["A"].width = 46
for col in "BCDEF":
    wi.column_dimensions[col].width = 12
wi.column_dimensions["G"].width = 60


def put(ws_, addr, value, *, inp_=False, fmt=None, note=None, note_col=None):
    c = ws_[addr]
    c.value = value
    if inp_:
        c.font = BLUE
        c.fill = INPUT
    if fmt:
        c.number_format = fmt
    if note and note_col:
        ws_[note_col].value = note
    return c


wi["A1"].value = f"Inputs: {t['name']} ({t['ticker']}), US dollars, millions"
wi["A1"].font = BOLD
wi["A3"].value = "Starting figures (FY2025, from the 10-K)"
wi["A3"].font = BOLD
rows = [
    (4, "Revenue", t["revenue"], "#,##0.0", "SEC XBRL; see the M&A project's dataset"),
    (5, "EBITDA (operating income + D&A, as reported)", t["ebitda"], "#,##0.0", ""),
    (6, "Depreciation and amortisation", t["da"], "#,##0.0", ""),
    (7, "Existing net debt (negative = net cash)", t["netDebt"], "#,##0.0", "Includes royalty-financing obligations as debt"),
]
for r, label, v, fmt, note in rows:
    wi[f"A{r}"].value = label
    put(wi, f"B{r}", v, inp_=True, fmt=fmt)
    wi[f"G{r}"].value = note
wi["A8"].value = "D&A as % of revenue"
wi["B8"].value = "=B6/B4"
wi["B8"].number_format = "0.0%"

wi["A10"].value = "Deal"
wi["A10"].font = BOLD
deal = [
    (11, "Entry multiple (EV / EBITDA)", inp["entryMultiple"], '0.0"x"', "Your assumption, not a market price"),
    (12, "Exit multiple", inp["exitMultiple"], '0.0"x"', ""),
    (13, "Senior debt (x EBITDA)", inp["seniorX"], '0.0"x"', ""),
    (14, "Subordinated debt (x EBITDA)", inp["subX"], '0.0"x"', ""),
    (15, "Senior interest rate", inp["seniorRate"], "0.0%", "Illustrative"),
    (16, "Subordinated interest rate", inp["subRate"], "0.0%", "Illustrative"),
    (17, "Mandatory repayment, % of original senior a year", inp["seniorAmortPct"], "0.0%", ""),
    (18, "Cash sweep, % of excess cash", inp["sweepPct"], "0%", ""),
    (19, "Fees, % of enterprise value", inp["feePct"], "0.0%", ""),
]
for r, label, v, fmt, note in deal:
    wi[f"A{r}"].value = label
    put(wi, f"B{r}", v, inp_=True, fmt=fmt)
    wi[f"G{r}"].value = note

wi["A21"].value = "Revenue growth"
wi["A21"].font = BOLD
for k in range(5):
    col = "BCDEF"[k]
    wi[f"{col}21"].value = f"Year {k + 1}"
    wi[f"{col}21"].font = BOLD
    put(wi, f"{col}22", inp["growth"][k], inp_=True, fmt="0.0%")
wi["A22"].value = "Growth rate"

wi["A24"].value = "Operations"
wi["A24"].font = BOLD
ops = [
    (25, "EBITDA margin in year 5", inp["marginTarget"], "0.0%", "Moves in a straight line from the FY2025 margin"),
    (26, "Capex, % of revenue", inp["capexPct"], "0.0%", "Assumption: not available in the data used"),
    (27, "Working-capital investment, % of change in revenue", inp["nwcPct"], "0%", ""),
    (28, "Tax rate", inp["taxRate"], "0.0%", "Federal statutory rate; no state tax"),
]
for r, label, v, fmt, note in ops:
    wi[f"A{r}"].value = label
    put(wi, f"B{r}", v, inp_=True, fmt=fmt)
    wi[f"G{r}"].value = note

# ------------------------------------------------------------------ Model
wm = wb.create_sheet("Model")
wm.column_dimensions["A"].width = 44
for col in "BCDEFG":
    wm.column_dimensions[col].width = 12
wm["A1"].value = "Projection and debt schedule ($m)"
wm["A1"].font = BOLD
heads = ["Close", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]
for k, h in enumerate(heads):
    c = wm.cell(row=2, column=2 + k, value=h)
    c.font = BOLD
    c.fill = HEAD
wm["A3"].value = "Year"
for k in range(6):
    wm.cell(row=3, column=2 + k, value=k)

labels = {
    4: "Revenue", 5: "EBITDA margin", 6: "EBITDA", 7: "Depreciation and amortisation", 8: "EBIT", 9: "Cash interest (on opening balances)",
    10: "Cash tax", 11: "Capex", 12: "Working-capital investment", 13: "Free cash flow before debt repayment", 14: "Mandatory repayment",
    15: "Cash available before sweep", 16: "Cash sweep", 21: "Senior debt (closing balance)", 22: "Subordinated debt (closing balance)",
    23: "Cash", 24: "Net debt", 25: "Net debt / EBITDA", 26: "EBITDA / cash interest",
}
for r, label in labels.items():
    wm[f"A{r}"].value = label
cols = "BCDEFG"
wm["B4"] = "=Inputs!B4"
wm["B5"] = "=Inputs!B5/Inputs!B4"
wm["B6"] = "=Inputs!B5"
wm["B21"] = "=Inputs!B13*Inputs!B5"
wm["B22"] = "=Inputs!B14*Inputs!B5"
wm["B23"] = 0
wm["B24"] = "=B21+B22-B23"
wm["B25"] = "=B24/B6"
for k in range(1, 6):
    c, p = cols[k], cols[k - 1]
    wm[f"{c}4"] = f"={p}4*(1+INDEX(Inputs!$B$22:$F$22,{c}3))"
    wm[f"{c}5"] = f"=$B$5+(Inputs!$B$25-$B$5)*{c}3/5"
    wm[f"{c}6"] = f"={c}4*{c}5"
    wm[f"{c}7"] = f"={c}4*Inputs!$B$8"
    wm[f"{c}8"] = f"={c}6-{c}7"
    wm[f"{c}9"] = f"={p}21*Inputs!$B$15+{p}22*Inputs!$B$16"
    wm[f"{c}10"] = f"=MAX(0,({c}8-{c}9)*Inputs!$B$28)"
    wm[f"{c}11"] = f"={c}4*Inputs!$B$26"
    wm[f"{c}12"] = f"=({c}4-{p}4)*Inputs!$B$27"
    wm[f"{c}13"] = f"={c}6-{c}9-{c}10-{c}11-{c}12"
    wm[f"{c}14"] = f"=MIN({p}21,Inputs!$B$17*$B$21)"
    wm[f"{c}15"] = f"={p}23+{c}13-{c}14"
    wm[f"{c}16"] = f"=MIN({p}21-{c}14,MAX(0,Inputs!$B$18*{c}15))"
    wm[f"{c}21"] = f"={p}21-{c}14-{c}16"
    wm[f"{c}22"] = f"={p}22"
    wm[f"{c}23"] = f"={c}15-{c}16"
    wm[f"{c}24"] = f"={c}21+{c}22-{c}23"
    wm[f"{c}25"] = f"={c}24/{c}6"
    wm[f"{c}26"] = f"=IF({c}9>0,{c}6/{c}9,\"n/a\")"
for r in list(range(4, 17)) + list(range(21, 25)):
    for col in cols:
        wm[f"{col}{r}"].number_format = "#,##0.0"
for col in cols:
    wm[f"{col}5"].number_format = "0.0%"
    wm[f"{col}25"].number_format = '0.0"x"'
    wm[f"{col}26"].number_format = '0.0"x"'
for r in (13, 24):
    wm[f"A{r}"].font = BOLD

# ------------------------------------------------------------------ Deal
wd = wb.create_sheet("Deal")
wd.column_dimensions["A"].width = 52
wd.column_dimensions["B"].width = 14
wd["A1"].value = "Funding, exit and returns ($m)"
wd["A1"].font = BOLD
deal_rows = [
    (3, "Enterprise value at entry", "=Inputs!B11*Inputs!B5", "#,##0.0"),
    (4, "Fees", "=Inputs!B19*B3", "#,##0.0"),
    (5, "Total uses (enterprise value + fees)", "=B3+B4", "#,##0.0"),
    (6, "Senior debt", "=Model!B21", "#,##0.0"),
    (7, "Subordinated debt", "=Model!B22", "#,##0.0"),
    (8, "Sponsor equity (the remainder)", "=B5-B6-B7", "#,##0.0"),
    (9, "Equity purchase price (enterprise value less existing net debt)", "=B3-Inputs!B7", "#,##0.0"),
    (12, "Exit enterprise value (exit multiple x year-5 EBITDA)", "=Inputs!B12*Model!G6", "#,##0.0"),
    (13, "Net debt at exit", "=Model!G24", "#,##0.0"),
    (14, "Equity value at exit", "=B12-B13", "#,##0.0"),
    (15, "Money multiple (MOIC)", "=B14/B8", '0.00"x"'),
    (16, "Annual return (IRR)", "=IF(B15>0,B15^(1/5)-1,-1)", "0.0%"),
    (19, "Bridge: EBITDA growth (entry multiple x change in EBITDA)", "=Inputs!B11*(Model!G6-Model!B6)", "#,##0.0"),
    (20, "Bridge: multiple change ((exit - entry) x year-5 EBITDA)", "=(Inputs!B12-Inputs!B11)*Model!G6", "#,##0.0"),
    (21, "Bridge: debt paid down (debt at close - net debt at exit)", "=B6+B7-B13", "#,##0.0"),
    (22, "Bridge: fees", "=-B4", "#,##0.0"),
    (23, "Bridge total = equity gain", "=SUM(B19:B22)", "#,##0.0"),
]
for r, label, f, fmt in deal_rows:
    wd[f"A{r}"].value = label
    wd[f"B{r}"].value = f
    wd[f"B{r}"].number_format = fmt
for r in (5, 8, 15, 16, 23):
    wd[f"A{r}"].font = BOLD
wd["A11"].value = "Exit and returns"
wd["A11"].font = BOLD
wd["A18"].value = "Where the return comes from"
wd["A18"].font = BOLD

# ------------------------------------------------------------------ Sensitivity
wsn = wb.create_sheet("Sensitivity")
wsn.column_dimensions["A"].width = 34
wsn["A1"].value = "IRR sensitivity: pasted values from the web model (not live formulas). Change the inputs on the Inputs sheet and the Deal sheet updates; these grids do not."
wsn["A1"].font = BOLD


def grid(top, title, corner, g, rfmt, cfmt):
    wsn.cell(row=top, column=1, value=title).font = BOLD
    wsn.cell(row=top + 1, column=1, value=corner)
    for j, cval in enumerate(g["cols"]):
        c = wsn.cell(row=top + 1, column=2 + j, value=cval)
        c.number_format = cfmt
        c.font = BOLD
        c.fill = HEAD
    for i, rval in enumerate(g["rows"]):
        c = wsn.cell(row=top + 2 + i, column=1, value=rval)
        c.number_format = rfmt
        c.font = BOLD
        for j in range(len(g["cols"])):
            v = g["values"][i][j]
            cc = wsn.cell(row=top + 2 + i, column=2 + j, value=v if v is not None else "n/a")
            cc.number_format = "0.0%"


grid(3, "IRR by entry multiple (rows) and exit multiple (columns)", "Entry \\ exit", ref["sens"]["entryExit"], '0.0"x"', '0.0"x"')
grid(12, "IRR by senior debt multiple (rows) and year-5 EBITDA margin (columns)", "Senior debt \\ margin", ref["sens"]["debtMargin"], '0.00"x"', "0.0%")

# ------------------------------------------------------------------ Checks
wc = wb.create_sheet("Checks")
wc.column_dimensions["A"].width = 70
wc["A1"].value = "Check"
wc["B1"].value = "Result"
for c in (wc["A1"], wc["B1"]):
    c.font = BOLD
checks = [
    ("Sources equal uses", "=ABS(Deal!B6+Deal!B7+Deal!B8-Deal!B5)<0.000001"),
    ("The value bridge adds up to the equity gain", "=ABS(Deal!B23-(Deal!B14-Deal!B8))<0.000001"),
    ("No debt balance is negative", "=MIN(Model!B21:G22)>=-0.000001"),
    ("Cash is never negative (no funding gap)", "=MIN(Model!B23:G23)>=-0.000001"),
    ("Sponsor equity is positive", "=Deal!B8>0"),
    ("IRR equals MOIC annualised over five years", "=ABS(Deal!B16-IF(Deal!B15>0,Deal!B15^(1/5)-1,-1))<0.000001"),
    ("Year-5 net debt equals senior + subordinated - cash", "=ABS(Model!G24-(Model!G21+Model!G22-Model!G23))<0.000001"),
]
for n, (label, f) in enumerate(checks, start=2):
    wc[f"A{n}"].value = label
    wc[f"B{n}"].value = f

wb.save(OUT / "lbo-model.xlsx")
print("saved", OUT / "lbo-model.xlsx")
