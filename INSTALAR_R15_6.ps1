param(
  [string]$Target = 'C:\Programas Base\OCR-Validacion-Excel-ocr-gpu-produccion',
  [switch]$VerifyOnly,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Pkg = Split-Path -Parent $MyInvocation.MyCommand.Path
$Manifest = Join-Path $Pkg 'MANIFEST_SHA256_R15_6.txt'
$PatchBuild = '15.10.1-r15.6'
$Backup = $null
$TransactionStarted = $false
$Created = New-Object System.Collections.ArrayList
$Replaced = New-Object System.Collections.ArrayList
$RootDocsMoved = New-Object System.Collections.ArrayList
$RelocatedDests = New-Object System.Collections.ArrayList

function Write-Section([string]$Text) {
  Write-Host ''
  Write-Host ('=== ' + $Text + ' ===') -ForegroundColor Cyan
}
function Get-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}
function Is-Prohibited([string]$Rel) {
  $norm = $Rel.Replace('/','\')
  return ($norm -eq 'AGENTS.md' -or $norm.StartsWith('.aprendizaje\') -or $norm -eq '.aprendizaje' -or $norm.StartsWith('.agents\') -or $norm -eq '.agents')
}
function Assert-SafeRelative([string]$Rel) {
  if ([string]::IsNullOrWhiteSpace($Rel)) { throw 'Ruta vacia en manifiesto.' }
  $norm = $Rel.Replace('/','\')
  if ([System.IO.Path]::IsPathRooted($norm)) { throw "Ruta absoluta prohibida en manifiesto: $Rel" }
  $parts = $norm.Split('\')
  if ($parts -contains '..' -or $parts -contains '.') { throw "Traversal prohibido en manifiesto: $Rel" }
  if ($norm.Contains(':')) { throw "Ruta con dos puntos prohibida en manifiesto: $Rel" }
}
function Read-Manifest {
  if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) {
    throw 'No se encontro MANIFEST_SHA256_R15_6.txt. Extrae TODO el ZIP antes de ejecutar.'
  }
  $items = @()
  foreach ($line in Get-Content -LiteralPath $Manifest -Encoding UTF8) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -notmatch '^([0-9A-Fa-f]{64})\s+(.+)$') { throw "Linea invalida en manifiesto: $line" }
    $hash = $matches[1].ToLowerInvariant()
    $rel = $matches[2].Trim().TrimStart('*')
    Assert-SafeRelative $rel
    if (Is-Prohibited $rel) { throw "Ruta protegida en manifiesto: $rel" }
    $src = Join-Path $Pkg ($rel.Replace('/','\'))
    $pkgFull = [System.IO.Path]::GetFullPath($Pkg).TrimEnd('\') + '\'
    $srcFull = [System.IO.Path]::GetFullPath($src)
    if (-not $srcFull.StartsWith($pkgFull, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Ruta fuera del paquete: $rel"
    }
    if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { throw "Falta archivo en paquete: $rel" }
    $got = Get-Sha256 $src
    if ($got -ne $hash) { throw "Hash incorrecto en paquete: $rel`nEsperado: $hash`nObtenido: $got" }
    $items += [pscustomobject]@{ Rel=$rel; Src=$src; Hash=$hash }
  }
  if ($items.Count -lt 1) { throw 'El manifiesto esta vacio.' }
  return $items
}
function Assert-TargetWritable {
  $probe = Join-Path $Target ('.vmatrix_write_probe_' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    [System.IO.File]::WriteAllText($probe, 'probe')
    Remove-Item -LiteralPath $probe -Force
  } catch {
    try { if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Force } } catch { }
    throw "La carpeta del programa no permite escritura. Ejecuta con permisos adecuados o revisa antivirus/permisos: $Target"
  }
}
function Assert-FreeSpace([long]$PackageBytes) {
  try {
    $root = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($Target))
    $drive = New-Object System.IO.DriveInfo($root)
    $required = [Math]::Max(100MB, $PackageBytes * 4)
    if ($drive.AvailableFreeSpace -lt $required) {
      throw ("Espacio insuficiente en {0}. Disponible {1:N1} MB; recomendado al menos {2:N1} MB para copia + backup." -f $root, ($drive.AvailableFreeSpace/1MB), ($required/1MB))
    }
  } catch [System.ArgumentException] {
    Write-Warning 'No fue posible medir espacio libre (ruta de red o unidad no estandar); se continuara con verificacion de escritura.'
  }
}
function Assert-VMatrixStopped {
  # R15 (MEDIA-12): preflight FAIL-CLOSED. En R14, un fallo de CIM/WMI
  # (catch con return silencioso) dejaba continuar la instalacion sin
  # comprobar que V-Matrix estuviera cerrado. Ahora: aviso visible + fallback
  # Get-Process; si tampoco puede validar, se ABORTA salvo -Force explicito.
  $targetFull = [System.IO.Path]::GetFullPath($Target).TrimEnd('\')
  $activos = @()
  $verificado = $true
  $motivo = $null
  try {
    $activos = Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
      $exe = [string]$_.ExecutablePath
      $cmd = [string]$_.CommandLine
      (($exe -and $exe.StartsWith($targetFull, [System.StringComparison]::OrdinalIgnoreCase)) -or
       ($cmd -and $cmd.IndexOf($targetFull, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.Name -match '^(python|pythonw|uvicorn|node)'))
    }
  } catch {
    $verificado = $false
    $motivo = "CIM/WMI no disponible ($($_.Exception.Message))"
    Write-Warning "No se pudo enumerar procesos con CIM/WMI: $motivo. Se intentara con Get-Process."
    try {
      $candidatos = @(Get-Process -ErrorAction Stop | Where-Object { $_.ProcessName -match '^(python|pythonw|uvicorn|node)$' })
      foreach ($p in $candidatos) {
        $exe = $null
        try { $exe = $p.Path } catch { }
        if ($exe -and $exe.StartsWith($targetFull, [System.StringComparison]::OrdinalIgnoreCase)) {
          $activos += [pscustomobject]@{ ProcessId=$p.Id; Name=$p.ProcessName }
        }
      }
      if ($candidatos.Count -eq 0) {
        # R15.1 (ALTO-03): sin interpretes python/pythonw/uvicorn/node no hay
        # backend ni frontend de V-Matrix en ejecucion: preflight seguro.
        $verificado = $true
        $motivo = $null
      } else {
        # R15.1 (ALTO-03): FAIL-CLOSED. Get-Process no ve la linea de comando:
        # un interprete global (p.ej. C:\Python311\python.exe) puede estar
        # ejecutando codigo de V-Matrix aunque su ejecutable no empiece por
        # $Target. Si existe cualquier candidato y no puede demostrarse que
        # es ajeno, el preflight queda NO VERIFICADO (aborta salvo -Force).
        $verificado = $false
        $motivo = "$motivo; hay $($candidatos.Count) proceso(s) python/pythonw/uvicorn/node y Get-Process no permite ver su linea de comando para demostrar que son ajenos a V-Matrix"
      }
    } catch {
      $motivo = "$motivo; Get-Process tambien fallo ($($_.Exception.Message))"
    }
  }
  if ($activos.Count -gt 0) {
    $detalle = ($activos | ForEach-Object { "PID $($_.ProcessId) $($_.Name)" }) -join ', '
    throw "V-Matrix parece seguir ejecutandose ($detalle). Cierralo por completo antes de instalar para evitar mezclar codigo viejo y nuevo."
  }
  if (-not $verificado) {
    if ($Force) {
      Write-Warning "PREFLIGHT DE PROCESOS NO VERIFICADO ($motivo). Se continua SOLO por -Force explicito; el respaldo y el rollback siguen activos."
    } else {
      throw "No se pudo verificar que V-Matrix este cerrado ($motivo). Cierra V-Matrix manualmente y reintenta, o ejecuta con -Force bajo tu responsabilidad."
    }
  }
}
function Assert-BaseConocida {
  # R15.1 (ALTO-04): este parche es ACUMULATIVO: solo se instala sobre una
  # base conocida (R14, R15 o R15.1 ya aplicado). Una carpeta vieja o
  # equivocada (V15.9.x sin R14, otro proyecto) aborta ANTES de modificar
  # cualquier archivo: sin base valida no hay instalacion hibrida posible.
  $basesVersion = @('15.10.1-r14','15.10.1-r15','15.10.1-r15.1','15.10.1-r15.2','15.10.1-r15.3','15.10.1-r15.4','15.10.1-r15.5','15.10.1-r15.6')
  $markersBase = @('PATCH_INSTALLED_V15_10_1_R14.json','PATCH_INSTALLED_V15_10_1_R15.json','PATCH_INSTALLED_V15_10_1_R15_1.json','PATCH_INSTALLED_V15_10_1_R15_2.json','PATCH_INSTALLED_V15_10_1_R15_3.json','PATCH_INSTALLED_V15_10_1_R15_4.json','PATCH_INSTALLED_V15_10_1_R15_5.json','PATCH_INSTALLED_V15_10_1_R15_6.json')
  $versionActual = $null
  $rutaVersion = Join-Path $Target 'VERSION.txt'
  if (Test-Path -LiteralPath $rutaVersion -PathType Leaf) {
    try { $versionActual = ((Get-Content -LiteralPath $rutaVersion -Encoding UTF8 -TotalCount 1).ToString().Trim().ToLowerInvariant()) } catch { }
  }
  if ($versionActual -and ($basesVersion -contains $versionActual)) { return }
  foreach ($m in $markersBase) {
    $rutaMarker = Join-Path $Target $m
    if (-not (Test-Path -LiteralPath $rutaMarker -PathType Leaf)) { continue }
    # R15.2 (MEDIO/BAJO-06): validar el CONTENIDO del marker, no solo su
    # existencia: un archivo vacio, corrupto o de otro proyecto no prueba una
    # base conocida. patch_build debe ser una version de parche aceptada.
    try {
      $contenido = Get-Content -LiteralPath $rutaMarker -Raw -Encoding UTF8 | ConvertFrom-Json
      $pb = ('' + $contenido.patch_build).Trim().ToLowerInvariant()
      if ($basesVersion -contains $pb) { return }
    } catch { }
  }
  throw ("BASE NO RECONOCIDA en $Target (VERSION.txt='$versionActual', sin marker valido R14/R15/R15.1/R15.2/R15.3/R15.4/R15.5/R15.6). Este parche es acumulativo y requiere V15.9.10 + R14 instalado (o R15/R15.1/R15.2/R15.3/R15.4/R15.5/R15.6). No se modifico ningun archivo.")
}
function Get-PythonCandidate {
  $candidates = New-Object System.Collections.ArrayList
  function Add-Candidate([string]$Exe, [string[]]$Prefix = @()) {
    if ([string]::IsNullOrWhiteSpace($Exe)) { return }
    if ($Exe -match '\\WindowsApps\\python(3)?\.exe$') { return }
    [void]$candidates.Add([pscustomobject]@{ Exe=$Exe; Prefix=$Prefix })
  }
  if ($env:VMATRIX_PYTHON -and (Test-Path -LiteralPath $env:VMATRIX_PYTHON -PathType Leaf)) { Add-Candidate $env:VMATRIX_PYTHON }
  foreach ($rel in @('.venv_ocr\Scripts\python.exe','.venv\Scripts\python.exe','venv\Scripts\python.exe','env\Scripts\python.exe','.env\Scripts\python.exe','python\python.exe','runtime\python.exe','Python\python.exe','Scripts\python.exe')) {
    $p = Join-Path $Target $rel; if (Test-Path -LiteralPath $p -PathType Leaf) { Add-Candidate $p }
  }
  foreach ($name in @('py.exe','python.exe','python3.exe')) {
    try { $cmd=Get-Command $name -ErrorAction Stop; if ($cmd.Source -and $cmd.Source -notmatch '\\WindowsApps\\') { if ($name -eq 'py.exe') { Add-Candidate $cmd.Source @('-3') } else { Add-Candidate $cmd.Source } } } catch { }
  }
  $seen=@{}
  foreach ($c in $candidates) {
    $key=($c.Exe+'|'+($c.Prefix -join ' ')).ToLowerInvariant(); if ($seen[$key]) { continue }; $seen[$key]=$true
    try { $out=& $c.Exe @($c.Prefix) -c "import sys; print(sys.executable)" 2>$null; if ($LASTEXITCODE -eq 0 -and $out) { return $c } } catch { }
  }
  return $null
}
function Verify-ImportResolution($Python) {
  if ($null -eq $Python) { return $false }
  $code = @'
import importlib.util, pathlib, sys
root=pathlib.Path(sys.argv[1]).resolve(); sys.path.insert(0,str(root))
names=['video_airbag','utilidades.verificador_apertura','utilidades.politica_apertura','utilidades.sincronizacion_video','utilidades.encabezados_institucionales','utilidades.estandar_apertura','utilidades.validacion_entradas','utilidades.resultado_caso','utilidades.matriz_apertura','dashboard.backend.app']
for name in names:
    spec=importlib.util.find_spec(name)
    if spec is None or spec.origin is None: raise SystemExit(31)
    origin=pathlib.Path(spec.origin).resolve()
    if root not in origin.parents and origin != root: raise SystemExit(32)
from dashboard.backend import app as backend_app
if getattr(backend_app,'PATCH_BUILD',None) != '15.10.1-r15.6': raise SystemExit(33)
print('PATCH_BUILD='+str(backend_app.PATCH_BUILD))
'@
  $out=& $Python.Exe @($Python.Prefix) -c $code $Target 2>&1
  Write-Host $out
  return ($LASTEXITCODE -eq 0)
}
function Copy-Verified([string]$Source, [string]$Destination, [string]$ExpectedHash) {
  $dir=Split-Path -Parent $Destination
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $tmp = Join-Path $dir ('.' + [System.IO.Path]::GetFileName($Destination) + '.r15_1.' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    Copy-Item -LiteralPath $Source -Destination $tmp -Force
    if ((Get-Sha256 $tmp) -ne $ExpectedHash) { throw "La copia temporal no coincide con SHA-256: $Destination" }
    Move-Item -LiteralPath $tmp -Destination $Destination -Force
    if ((Get-Sha256 $Destination) -ne $ExpectedHash) { throw "La copia final no coincide con SHA-256: $Destination" }
  } finally {
    try { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force } } catch { }
  }
}
function Relocate-LegacyRootDocs([string]$BackupRoot) {
  $legacy=@()
  # R15: README_R14.md deja de vivir en la raiz; su copia oficial R15 es
  # docs/informes/README_R14.md (incluida en el manifiesto). El archivo de la
  # raiz se archiva en el historial para no perder trazabilidad.
  $informes=Join-Path $Target 'docs\informes\README_R14.md'
  $raizR14=Join-Path $Target 'README_R14.md'
  if ((Test-Path -LiteralPath $raizR14 -PathType Leaf) -and (Test-Path -LiteralPath $informes -PathType Leaf)) {
    if ((Get-Sha256 $raizR14) -eq (Get-Sha256 $informes)) {
      # R15.1 (MEDIO-08): registrar la mutacion ANTES de ejecutarla: el
      # rollback restaura README_R14.md de la raiz desde el backup.
      $bakDirRaiz = Join-Path $BackupRoot '_ROOT_DOCS'
      New-Item -ItemType Directory -Path $bakDirRaiz -Force | Out-Null
      Copy-Item -LiteralPath $raizR14 -Destination (Join-Path $bakDirRaiz 'README_R14.md') -Force
      [void]$RootDocsMoved.Add('README_R14.md')
      Remove-Item -LiteralPath $raizR14 -Force
      Write-Host 'README_R14.md de la raiz retirado: ya existe identico en docs\informes (registrado para rollback).'
    }
  }
  foreach ($name in @('INSTRUCCIONES_HOTFIX_ARRANQUE.md','README_CORRECCIONES_VERSIONES.md','README_CORRECCION_ACUMULADA_V15_10_1.md')) {
    $p=Join-Path $Target $name; if (Test-Path -LiteralPath $p -PathType Leaf) { $legacy += Get-Item -LiteralPath $p }
  }
  try {
    $legacy += Get-ChildItem -LiteralPath $Target -File -Filter '*.md' -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^README_R\d+\.md$' -or $_.Name -match '^PLAN_Y_CORRECCION_V15_10_1_R\d+\.md$' }
    $legacy += Get-ChildItem -LiteralPath $Target -File -Filter '*.txt' -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'INSTRUCCIONES_APLICAR_PARCHE.txt' -or $_.Name -match '^MANIFEST_SHA256_.*\.txt$' -or $_.Name -in @('_ARCHIVOS_INCLUIDOS.txt','_INFORME_DIAGNOSTICO.txt') }
  } catch { }
  $legacy=@($legacy | Sort-Object FullName -Unique); if ($legacy.Count -eq 0) { return }
  $destDir=Join-Path $Target 'docs\historial\parches\acumulados'; New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  $bakDir=Join-Path $BackupRoot '_ROOT_DOCS'; New-Item -ItemType Directory -Path $bakDir -Force | Out-Null
  foreach ($file in $legacy) {
    Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $bakDir $file.Name) -Force
    [void]$RootDocsMoved.Add($file.Name)
    $dest=Join-Path $destDir $file.Name
    if (Test-Path -LiteralPath $dest -PathType Leaf) {
      if ((Get-Sha256 $dest) -eq (Get-Sha256 $file.FullName)) { Remove-Item -LiteralPath $file.FullName -Force; continue }
      $stem=[IO.Path]::GetFileNameWithoutExtension($file.Name); $ext=[IO.Path]::GetExtension($file.Name)
      $dest=Join-Path $destDir ($stem + '_root_pre_R15_6' + $ext)
    }
    # R15.1 (MEDIO-08): registrar la copia en acumulados ANTES de crearla;
    # el rollback la retira (o restaura el destino previo si se sobrescribio).
    $previo = $null
    if (Test-Path -LiteralPath $dest -PathType Leaf) {
      $previo = Join-Path $bakDir ([IO.Path]::GetFileName($dest) + '.dest_previo')
      Copy-Item -LiteralPath $dest -Destination $previo -Force
    }
    [void]$RelocatedDests.Add([pscustomobject]@{ Dest=$dest; Previo=$previo })
    Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
    Remove-Item -LiteralPath $file.FullName -Force
  }
}
function Rollback-Transaction {
  if (-not $TransactionStarted -or -not $Backup) { return }
  Write-Host ''; Write-Host '=== ROLLBACK AUTOMATICO ===' -ForegroundColor Yellow
  foreach ($rel in @($Created)) {
    $dst=Join-Path $Target ($rel.Replace('/','\')); try { if (Test-Path -LiteralPath $dst -PathType Leaf) { Remove-Item -LiteralPath $dst -Force } } catch { Write-Warning "No se pudo retirar creado: $rel" }
  }
  foreach ($rel in @($Replaced)) {
    $bak=Join-Path $Backup ($rel.Replace('/','\')); $dst=Join-Path $Target ($rel.Replace('/','\'))
    try { if (Test-Path -LiteralPath $bak -PathType Leaf) { Copy-Item -LiteralPath $bak -Destination $dst -Force } } catch { Write-Warning "No se pudo restaurar: $rel" }
  }
  $rootBak=Join-Path $Backup '_ROOT_DOCS'
  foreach ($name in @($RootDocsMoved)) {
    $src=Join-Path $rootBak $name; $dst=Join-Path $Target $name
    try { if (Test-Path -LiteralPath $src -PathType Leaf) { Copy-Item -LiteralPath $src -Destination $dst -Force } } catch { Write-Warning "No se pudo restaurar documento: $name" }
  }
  # R15.1 (MEDIO-08): deshacer las reubicaciones en acumulados: retirar las
  # copias creadas y restaurar los destinos que fueron sobrescritos.
  foreach ($r in @($RelocatedDests)) {
    try {
      if ($r.Previo -and (Test-Path -LiteralPath $r.Previo -PathType Leaf)) {
        Copy-Item -LiteralPath $r.Previo -Destination $r.Dest -Force
      } elseif (Test-Path -LiteralPath $r.Dest -PathType Leaf) {
        Remove-Item -LiteralPath $r.Dest -Force
      }
    } catch { Write-Warning "No se pudo deshacer reubicacion: $($r.Dest)" }
  }
  # R15.2 (MEDIO/BAJO-06): si la instalacion previa tenia marker propio, se
  # RESTAURA; solo se elimina cuando este run lo creo desde cero.
  try {
    $marker=Join-Path $Target 'PATCH_INSTALLED_V15_10_1_R15_6.json'
    $previo=Join-Path $Backup '_MARKER_PREVIO.json'
    if (Test-Path -LiteralPath $previo -PathType Leaf) { Copy-Item -LiteralPath $previo -Destination $marker -Force }
    elseif (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
  } catch { }
  Write-Host "Rollback intentado desde: $Backup" -ForegroundColor Yellow
}

try {
  Write-Section 'V-Matrix V15.10.1 R15.6 - preflight e instalacion transaccional'
  Write-Host "Destino: $Target"
  if (-not (Test-Path -LiteralPath $Target -PathType Container)) { throw "No existe la carpeta destino: $Target" }
  $baseRequired=@('configuracion.py','flujo_empresarial.py','aprendizaje_video_airbag.py','dashboard\frontend\estilos.css','dashboard\frontend\i18n.js','dashboard\frontend\vendor\htm.umd.js')
  $missing=@($baseRequired | Where-Object { -not (Test-Path -LiteralPath (Join-Path $Target $_) -PathType Leaf) })
  if ($missing.Count -gt 0) { throw ("BASE INCOMPLETA. No se modifico nada. Faltan:`n - " + ($missing -join "`n - ")) }
  Assert-BaseConocida
  $items=Read-Manifest
  if (-not $VerifyOnly) {
    Assert-VMatrixStopped
    Assert-TargetWritable
    $pkgBytes=($items | ForEach-Object { (Get-Item -LiteralPath $_.Src).Length } | Measure-Object -Sum).Sum
    Assert-FreeSpace ([long]$pkgBytes)
    $stamp=Get-Date -Format 'yyyyMMdd_HHmmssfff'
    $Backup=Join-Path (Split-Path -Parent $Target) ((Split-Path -Leaf $Target) + '_BACKUP_PRE_R15_6_' + $stamp)
    New-Item -ItemType Directory -Path $Backup -Force | Out-Null
    $TransactionStarted=$true
    Write-Section 'Copia verificada con respaldo'
    foreach ($item in $items) {
      $dst=Join-Path $Target ($item.Rel.Replace('/','\'))
      if (Test-Path -LiteralPath $dst -PathType Leaf) {
        $bak=Join-Path $Backup ($item.Rel.Replace('/','\')); $bakDir=Split-Path -Parent $bak; New-Item -ItemType Directory -Path $bakDir -Force | Out-Null
        Copy-Item -LiteralPath $dst -Destination $bak -Force; [void]$Replaced.Add($item.Rel)
      } else { [void]$Created.Add($item.Rel) }
      Copy-Verified $item.Src $dst $item.Hash
    }
    Set-Content -LiteralPath (Join-Path $Backup 'CREADOS_POR_PARCHE.txt') -Value ($Created -join "`r`n") -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $Backup 'REEMPLAZADOS_POR_PARCHE.txt') -Value ($Replaced -join "`r`n") -Encoding UTF8
  }

  Write-Section 'Verificacion SHA-256 en destino'
  $errors=New-Object System.Collections.ArrayList
  foreach ($item in $items) {
    $dst=Join-Path $Target ($item.Rel.Replace('/','\'))
    if (-not (Test-Path -LiteralPath $dst -PathType Leaf)) { [void]$errors.Add('NO_EXISTE: '+$item.Rel); continue }
    if ((Get-Sha256 $dst) -ne $item.Hash) { [void]$errors.Add('HASH_DISTINTO: '+$item.Rel) }
  }
  if ($errors.Count -gt 0) { throw ("ERROR POST-COPIA:`n - " + ($errors -join "`n - ")) }
  Write-Host 'Hashes destino: OK' -ForegroundColor Green

  $index=Get-Content -LiteralPath (Join-Path $Target 'dashboard\frontend\index.html') -Raw -Encoding UTF8
  if ($index -notmatch '15\.10\.1-r15\.6') { throw 'index.html no contiene la version de cache R15.6.' }
  $backend=Get-Content -LiteralPath (Join-Path $Target 'dashboard\backend\app.py') -Raw -Encoding UTF8
  if ($backend -notmatch 'PATCH_BUILD\s*=\s*["'']15\.10\.1-r15\.6["'']') { throw 'app.py no contiene PATCH_BUILD R15.6.' }
  # R15.1 (ALTO-05): VERSION.txt es parte de la identidad del paquete y esta
  # incluido en el manifiesto; el arbol instalado debe declarar la MISMA
  # version que backend/frontend/marker (benchmark_detector.py lo consume).
  $versionTxt=Join-Path $Target 'VERSION.txt'
  if (-not (Test-Path -LiteralPath $versionTxt -PathType Leaf)) { throw 'VERSION.txt no existe en el destino (ALTO-05: identidad de version incompleta).' }
  $versionContenido=((Get-Content -LiteralPath $versionTxt -Encoding UTF8 -TotalCount 1).ToString().Trim())
  if ($versionContenido -notmatch '^15\.10\.1-r15\.6$') { throw "VERSION.txt no declara 15.10.1-r15.6 (encontrado: '$versionContenido')." }

  Write-Section 'Python real de V-Matrix'
  $python=Get-PythonCandidate
  if ($null -ne $python) {
    Write-Host ('Python encontrado: '+$python.Exe+' '+($python.Prefix -join ' '))
    if (-not (Verify-ImportResolution $python)) { throw 'Python encontrado, pero no resuelve los modulos R15 desde el arbol destino.' }
    Write-Host 'Resolucion de modulos: OK' -ForegroundColor Green
  } else {
    Write-Warning 'No se encontro Python invocable. Los hashes quedaron verificados, pero debes confirmar /api/estado al reiniciar.'
  }

  if (-not $VerifyOnly) {
    Relocate-LegacyRootDocs $Backup
    $marker=[ordered]@{ patch_build=$PatchBuild; instalado_en=(Get-Date).ToString('s'); proyecto=$Target; instalador='PowerShell-R15_6-transaccional'; hash_verificado=$true; backup=$Backup }
    # R15.2 (MEDIO/BAJO-06): en reinstalacion, respaldar el marker previo ANTES
    # de sobrescribirlo; el rollback lo restaura (la carpeta nunca pierde la
    # evidencia de su instalacion anterior).
    $markerPath=Join-Path $Target 'PATCH_INSTALLED_V15_10_1_R15_6.json'
    if ($TransactionStarted -and (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
      Copy-Item -LiteralPath $markerPath -Destination (Join-Path $Backup '_MARKER_PREVIO.json') -Force
    }
    $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding UTF8
  }

  Write-Section 'RESULTADO'
  if ($VerifyOnly) { Write-Host 'R15_6_VERIFICADO_OK' -ForegroundColor Green }
  else { Write-Host 'PARCHE_R15_6_COPIADO_Y_VERIFICADO_OK' -ForegroundColor Green; Write-Host "Backup: $Backup" }
  Write-Host 'Reinicia V-Matrix y confirma /api/estado -> patch_build = 15.10.1-r15.6'
  exit 0
}
catch {
  Write-Host ''; Write-Host ('ERROR: '+$_.Exception.Message) -ForegroundColor Red
  if (-not $VerifyOnly) { Rollback-Transaction }
  exit 1
}
