<#
.SYNOPSIS
  Build the private Silinx Xilinx ISE 14.7 image from your own installer + WebPACK license,
  then configure Silinx to use it. Windows 10/11 with Docker Desktop (WSL 2 backend).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File docker\ise\build-ise-image.ps1 `
      -Installer $HOME\Downloads\Xilinx_ISE_DS_Lin_14.7_1015_1.tar -License $HOME\Downloads\Xilinx.lic

.NOTES
  Needs ~30 GB free disk during the build. The image contains AMD/Xilinx software and your
  license: never push it to a public registry.
  Without -Installer or -License, the file is taken from $HOME\Downloads, and the script says which
  it took. The MD5 check compares the installer with the sum AMD publishes: it tells a corrupt or a
  different download apart (integrity), not who made the file (authenticity): download the installer
  from AMD's site yourself, over https.
#>
param(
  [string]$Installer = "",
  [string]$License = "",
  [string]$Tag = "xilinx/ise:14.7",
  [switch]$NoMd5,
  [switch]$Full,          # keep the complete ~18 GB ISE install (default: trimmed to ~3 GB)
  [string]$Families = ""  # e.g. "spartan3e spartan6": keep only these device families
)
$ErrorActionPreference = "Stop"
$Md5Expected = "e8065b2ffb411bb74ae32efa475f9817"   # Xilinx_ISE_DS_Lin_14.7_1015_1.tar
$KitDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SilinxDir = Resolve-Path (Join-Path $KitDir "..\..")

function Die($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Info($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
# (the default: $HOME\Downloads, said; not the current folder, #1442)
function Find-Default($name) {
  $p = Join-Path "$HOME\Downloads" $name; if (Test-Path $p) { return $p }
  return ""
}

if (-not $Installer) { $Installer = Find-Default "Xilinx_ISE_DS_Lin_14.7_1015_1.tar"; if ($Installer) { Info "installer: $Installer (no -Installer given)" } }
if (-not $License) { $License = Find-Default "Xilinx.lic"; if ($License) { Info "license: $License (no -License given)" } }
if (-not $Installer -or -not (Test-Path $Installer)) { Die "installer not found. Download 'ISE Design Suite 14.7 - Full Installer for Linux' (Xilinx_ISE_DS_Lin_14.7_1015_1.tar) from AMD and pass -Installer <path>." }
if (-not $License -or -not (Test-Path $License)) { Die "license not found. Get a free 'ISE WebPACK License' (Xilinx.lic) from the AMD/Xilinx licensing site and pass -License <path>." }
$Installer = (Resolve-Path $Installer).Path
$License = (Resolve-Path $License).Path
if ((Split-Path -Leaf $Installer) -ne "Xilinx_ISE_DS_Lin_14.7_1015_1.tar") { Die "the installer file must be named Xilinx_ISE_DS_Lin_14.7_1015_1.tar" }
$lic = Get-Content -Raw $License
if ($lic -notmatch "INCREMENT") { Die "$License does not look like a Xilinx license file" }
if ($lic -notmatch "HOSTID=ANY") { Write-Host "WARNING: the license is node-locked (no HOSTID=ANY); it may not work inside a container." -ForegroundColor Yellow }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die "docker not found. Install Docker Desktop for Windows (WSL 2 backend)." }
docker info *> $null; if ($LASTEXITCODE -ne 0) { Die "Docker Desktop is not running." }
docker buildx version *> $null; if ($LASTEXITCODE -ne 0) { Die "docker buildx (BuildKit) is required: update Docker Desktop." }

if (-not $NoMd5) {
  Info "checking the installer MD5 (about a minute; -NoMd5 to skip)"
  $sum = (Get-FileHash -Algorithm MD5 $Installer).Hash.ToLower()
  if ($sum -ne $Md5Expected) { Die "installer MD5 is $sum, expected $Md5Expected (corrupt or different download)" }
}

# Windows on ARM: ISE is x86-64 only
if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
  Info "ARM64 host: checking that Docker can run linux/amd64 containers"
  $arch = (docker run --rm --platform linux/amd64 ubuntu:14.04 uname -m) | Select-Object -Last 1
  if ($arch -ne "x86_64") { Die "Docker cannot run x86-64 containers on this ARM PC (enable amd64 emulation in Docker Desktop)." }
}

# Stage the installer in its own folder (hard link on the same NTFS volume, else copy) so that
# BuildKit transfers only the tarball, then pass installer + license folders as build contexts.
# The folder is a new one of this run (#1442): the cleanup at the end removes nothing that was there before.
$Stage = Join-Path (Split-Path -Parent $Installer) (".silinx-stage." + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $Stage | Out-Null
$StagedTar = Join-Path $Stage "Xilinx_ISE_DS_Lin_14.7_1015_1.tar"
try { New-Item -ItemType HardLink -Path $StagedTar -Target $Installer | Out-Null }
catch { Info "copying the installer to a staging folder"; Copy-Item $Installer $StagedTar }
$LicDir = Join-Path ([System.IO.Path]::GetTempPath()) ("silinx-lic-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $LicDir | Out-Null
Copy-Item $License (Join-Path $LicDir "Xilinx.lic")

try {
  Info "building $Tag (extracting + installing ISE takes 20-60 min)"
  $extra = @()
  if ($Full) { $extra += @("--build-arg", "ISE_FULL=1") }
  if ($Families) { $extra += @("--build-arg", "KEEP_FAMILIES=$Families") }
  docker buildx build --load --platform linux/amd64 @extra --build-context "installer=$Stage" --build-context "license=$LicDir" -t $Tag $KitDir
  if ($LASTEXITCODE -ne 0) { Die "docker build failed" }

  Info "smoke test"
  docker run --rm --platform linux/amd64 $Tag bash -c 'which xst ngdbuild map par trce bitgen >/dev/null && echo "ISE tools: OK"'
  if ($LASTEXITCODE -ne 0) { Die "ISE tools not found in the image" }
  $Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("silinx-xst-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
  Set-Content -NoNewline -Path (Join-Path $Tmp "t.v") -Value "module t(input a, input b, output y); assign y = a & b; endmodule`n"
  Set-Content -NoNewline -Path (Join-Path $Tmp "t.prj") -Value "verilog work `"t.v`"`n"
  Set-Content -NoNewline -Path (Join-Path $Tmp "t.xst") -Value "run -ifn t.prj -ifmt mixed -ofn t -ofmt NGC -p xc3s250e-4-cp132 -top t`n"
  docker run --rm --platform linux/amd64 -v "${Tmp}:/work" $Tag bash -c 'xst -ifn t.xst -ofn t.syr >/dev/null 2>&1; test -f t.ngc'
  if ($LASTEXITCODE -ne 0) { Die "XST could not synthesize a test design (license problem?). See $Tmp\t.syr" }
  Write-Host "XST synthesis with your license: OK"
  Remove-Item -Recurse -Force $Tmp

  if ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $SilinxDir "bin\silinx.js"))) {
    node (Join-Path $SilinxDir "bin\silinx.js") toolchain --docker $Tag
  } else {
    Write-Host "Configure Silinx: Tools > Toolchain Settings > Docker image = $Tag"
  }
  Info "done. Keep the image private: it contains AMD/Xilinx software and your license."
} finally {
  Remove-Item -Recurse -Force $LicDir -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $Stage -ErrorAction SilentlyContinue
}
