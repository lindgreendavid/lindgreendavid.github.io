# Opens the generated LBO workbook in Excel, recalculates every formula, verifies the Checks sheet, compares the headline results with the
# web model's reference values (src/data/lbo/reference.json) and saves cached values. Needs Microsoft Excel (COM).
$root = Join-Path $PSScriptRoot "..\.."
$path = (Resolve-Path (Join-Path $root "public\downloads\lbo-workbench\lbo-model.xlsx")).Path
$ref = Get-Content (Join-Path $root "src\data\lbo\reference.json") -Raw | ConvertFrom-Json
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
$ok = $true
try {
  $wb = $xl.Workbooks.Open($path)
  $xl.CalculateFull()
  $k = $wb.Worksheets.Item("Checks")
  $r = 2
  while ($k.Cells.Item($r, 1).Text -ne "") {
    $res = $k.Cells.Item($r, 2).Text
    "{0} | {1}" -f $res, $k.Cells.Item($r, 1).Text
    if ($res -ne "TRUE") { $ok = $false }
    $r++
  }
  $d = $wb.Worksheets.Item("Deal")
  $pairs = @(
    @("sponsor equity", $d.Range("B8").Value2, $ref.result.sponsorEquity),
    @("exit equity", $d.Range("B14").Value2, $ref.result.exitEquity),
    @("MOIC", $d.Range("B15").Value2, $ref.result.moic),
    @("IRR", $d.Range("B16").Value2, $ref.result.irr),
    @("bridge: EBITDA growth", $d.Range("B19").Value2, $ref.result.bridge.ebitdaGrowth),
    @("bridge: debt paid down", $d.Range("B21").Value2, $ref.result.bridge.deleveraging)
  )
  foreach ($p in $pairs) {
    $diff = [math]::Abs([double]$p[1] - [double]$p[2])
    $good = $diff -lt 1e-6
    "{0}: Excel {1:N6} vs web {2:N6} -> {3}" -f $p[0], $p[1], $p[2], $(if ($good) { "match" } else { "MISMATCH" })
    if (-not $good) { $ok = $false }
  }
  $m = $wb.Worksheets.Item("Model")
  for ($y = 0; $y -lt 5; $y++) {
    $col = [char](67 + $y)
    $refY = $ref.result.years[$y]
    foreach ($q in @(@(6, "ebitda"), @(21, "senior"), @(23, "cash"))) {
      $v = [double]$m.Range("$col$($q[0])").Value2
      $e = [double]$refY.($q[1])
      if ([math]::Abs($v - $e) -gt 1e-6) { "Year $($y + 1) $($q[1]): Excel $v vs web $e MISMATCH"; $ok = $false }
    }
  }
  $wb.Worksheets.Item("README").Activate()
  $wb.Save()
  $wb.Close($true)
} finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
if (-not $ok) { Write-Error "At least one workbook check or comparison failed"; exit 1 }
"workbook recalculated, matches the web model, and saved with cached values"
