# Opens the generated workbook in Excel, recalculates every formula, verifies the Checks sheet and saves cached values.
# Needs Microsoft Excel (COM). Run after tools/pharma/build-workbook.py. It fails if any check is not TRUE.
$path = Join-Path $PSScriptRoot "..\..\public\downloads\pharma-valuation\pharma-valuation-model.xlsx"
$path = (Resolve-Path $path).Path
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
  $d = $wb.Worksheets.Item("DCF")
  "DCF enterprise value {0:N2}; value per share {1:N4}" -f $d.Range("B33").Value2, $d.Range("B44").Value2
  $wb.Worksheets.Item("README").Activate()
  $wb.Save()
  $wb.Close($true)
} finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
if (-not $ok) { Write-Error "At least one workbook check is not TRUE"; exit 1 }
"workbook recalculated and saved with cached values"
