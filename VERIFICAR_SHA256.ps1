# Verifica SHA256SUMS.txt desde dentro del paquete extraido (Windows).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fallas = 0
foreach ($linea in Get-Content -LiteralPath (Join-Path $root 'SHA256SUMS.txt') -Encoding UTF8) {
  if ($linea -notmatch '^([0-9a-f]{64})  (.+)$') { continue }
  $hash = $matches[1]; $rel = $matches[2]
  if ($rel -eq 'SHA256SUMS.txt' -or $rel -like 'VERIFICAR_SHA256*' -or $rel -like 'verificar_sha256*') { continue }
  $ruta = Join-Path $root ($rel -replace '/','\')
  if (-not (Test-Path -LiteralPath $ruta -PathType Leaf)) { Write-Host "FALTA: $rel" -ForegroundColor Red; $fallas++; continue }
  $got = (Get-FileHash -Algorithm SHA256 -LiteralPath $ruta).Hash.ToLowerInvariant()
  if ($got -ne $hash) { Write-Host "HASH DISTINTO: $rel" -ForegroundColor Red; $fallas++ }
}
if ($fallas -gt 0) { Write-Host "$fallas fallo(s)"; exit 1 }
Write-Host 'SHA256SUMS OK' -ForegroundColor Green
