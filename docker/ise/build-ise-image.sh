#!/usr/bin/env bash
# Build the private Silinx Xilinx ISE 14.7 image from your own installer + WebPACK license,
# then configure Silinx to use it.  macOS (Intel / Apple Silicon) and Linux (x86-64 / ARM64).
#
#   docker/ise/build-ise-image.sh --installer ~/Downloads/Xilinx_ISE_DS_Lin_14.7_1015_1.tar \
#                                 --license   ~/Downloads/Xilinx.lic  [--tag silinx/ise:14.7] [--no-md5]
#                                 [--full | --families "spartan3e spartan6"]
# Default: ISE trimmed to the command-line flow (about 3 GB, every device family). --full keeps the
# complete ~18 GB install; --families keeps only the listed families' device data.
#
# Requirements: Docker (Docker Desktop, OrbStack, Colima or Docker Engine) with BuildKit, ~30 GB
# free disk during the build. The image contains AMD/Xilinx software and your license: never push
# it to a public registry.
set -euo pipefail

TAG="silinx/ise:14.7"
INSTALLER=""
LICENSE=""
CHECK_MD5=1
BUILD_ARGS=()
MD5_EXPECTED="e8065b2ffb411bb74ae32efa475f9817"   # Xilinx_ISE_DS_Lin_14.7_1015_1.tar (AMD download page)
KIT_DIR="$(cd "$(dirname "$0")" && pwd)"
SILINX_DIR="$(cd "$KIT_DIR/../.." && pwd)"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "==> $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --installer) INSTALLER="$2"; shift 2 ;;
    --license) LICENSE="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --no-md5) CHECK_MD5=0; shift ;;
    --full) BUILD_ARGS+=(--build-arg ISE_FULL=1); shift ;;
    --families) BUILD_ARGS+=(--build-arg "KEEP_FAMILIES=$2"); shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "unknown option $1 (see --help)" ;;
  esac
done

# --- locate the inputs (default: ~/Downloads)
find_default() { for d in "$HOME/Downloads" "$PWD" "$KIT_DIR"; do [ -f "$d/$1" ] && { echo "$d/$1"; return; }; done; }
[ -n "$INSTALLER" ] || INSTALLER="$(find_default Xilinx_ISE_DS_Lin_14.7_1015_1.tar || true)"
[ -n "$LICENSE" ] || LICENSE="$(find_default Xilinx.lic || true)"
[ -f "$INSTALLER" ] || die "installer not found. Download 'ISE Design Suite 14.7 - Full Installer for Linux' (Xilinx_ISE_DS_Lin_14.7_1015_1.tar) from AMD and pass --installer <path>."
[ -f "$LICENSE" ] || die "license not found. Get a free 'ISE WebPACK License' (Xilinx.lic) from the AMD/Xilinx licensing site and pass --license <path>."
[ "$(basename "$INSTALLER")" = "Xilinx_ISE_DS_Lin_14.7_1015_1.tar" ] || die "the installer file must be named Xilinx_ISE_DS_Lin_14.7_1015_1.tar"
grep -q "ISE_WebPACK\|INCREMENT" "$LICENSE" || die "$LICENSE does not look like a Xilinx license file"
grep -q "HOSTID=ANY" "$LICENSE" || echo "WARNING: the license is node-locked (no HOSTID=ANY); it may not work inside a container."

# --- docker
command -v docker >/dev/null || die "docker not found. Install Docker Desktop, OrbStack, Colima or Docker Engine."
docker info >/dev/null 2>&1 || die "the docker daemon is not running (start Docker Desktop / OrbStack / 'colima start')."
docker buildx version >/dev/null 2>&1 || die "docker buildx (BuildKit) is required: update Docker."

if [ "$CHECK_MD5" = 1 ]; then
  info "checking the installer MD5 (about a minute; --no-md5 to skip)"
  if command -v md5sum >/dev/null; then sum="$(md5sum "$INSTALLER" | cut -d' ' -f1)"; else sum="$(md5 -q "$INSTALLER")"; fi
  [ "$sum" = "$MD5_EXPECTED" ] || die "installer MD5 is $sum, expected $MD5_EXPECTED (corrupt or different download)"
fi

# --- x86-64 emulation on ARM hosts
ARCH="$(uname -m)"
if [ "$ARCH" != "x86_64" ]; then
  info "ARM host ($ARCH): ISE is x86-64 only, checking that Docker can run linux/amd64 containers"
  if ! out="$(docker run --rm --platform linux/amd64 ubuntu:14.04 uname -m 2>&1)" || [ "$(echo "$out" | tail -1)" != "x86_64" ]; then
    echo "$out" | tail -3 >&2
    cat >&2 <<'EOF'
ERROR: Docker cannot run x86-64 (linux/amd64) containers. Enable emulation:
  * Docker Desktop (Mac): Settings > General > "Use Rosetta for x86_64/amd64 emulation on Apple Silicon"
  * OrbStack (Mac): works out of the box (Rosetta)
  * Colima (Mac):  colima stop && colima start --vm-type vz --vz-rosetta --memory 8 --disk 100
  * Linux ARM64:   docker run --privileged --rm tonistiigi/binfmt --install amd64
EOF
    exit 1
  fi
fi

# --- build (installer and license folders are passed as named build contexts)
# The installer gets its own folder (hard link: instant, no extra space), so BuildKit only
# transfers the tarball and not everything else that sits next to it (e.g. ~/Downloads).
INSTALLER_DIR="$(cd "$(dirname "$INSTALLER")" && pwd)/.silinx-ise-stage"
mkdir -p "$INSTALLER_DIR" 2>/dev/null || INSTALLER_DIR="$(mktemp -d)"
if [ ! -f "$INSTALLER_DIR/Xilinx_ISE_DS_Lin_14.7_1015_1.tar" ]; then
  ln "$INSTALLER" "$INSTALLER_DIR/Xilinx_ISE_DS_Lin_14.7_1015_1.tar" 2>/dev/null \
    || { info "copying the installer to a staging folder (different disk)"; cp "$INSTALLER" "$INSTALLER_DIR/Xilinx_ISE_DS_Lin_14.7_1015_1.tar"; }
fi
LICENSE_DIR="$(mktemp -d)"
trap 'rm -rf "$LICENSE_DIR" "$INSTALLER_DIR"' EXIT
cp "$LICENSE" "$LICENSE_DIR/Xilinx.lic"
info "building $TAG (extracting + installing ISE takes 20-60 min, longer under emulation)"
docker buildx build --load --platform linux/amd64 ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"} \
  --build-context "installer=$INSTALLER_DIR" \
  --build-context "license=$LICENSE_DIR" \
  -t "$TAG" "$KIT_DIR"

# --- smoke test: tools present and the license accepted by XST
info "smoke test"
docker run --rm --platform linux/amd64 "$TAG" bash -c 'which xst ngdbuild map par trce bitgen >/dev/null && echo "ISE tools: OK"'
tmp="$(mktemp -d)"; trap 'rm -rf "$LICENSE_DIR" "$INSTALLER_DIR" "$tmp"' EXIT
cat > "$tmp/t.v" <<'EOF'
module t(input a, input b, output y); assign y = a & b; endmodule
EOF
printf 'verilog work "t.v"\n' > "$tmp/t.prj"
printf 'run -ifn t.prj -ifmt mixed -ofn t -ofmt NGC -p xc3s250e-4-cp132 -top t\n' > "$tmp/t.xst"
if docker run --rm --platform linux/amd64 -v "$tmp:/work" "$TAG" bash -c 'xst -ifn t.xst -ofn t.syr >/dev/null 2>&1; test -f t.ngc'; then
  echo "XST synthesis with your license: OK"
else
  die "XST could not synthesize a test design (license problem?). See $tmp/t.syr"
fi

# --- configure Silinx
if command -v node >/dev/null && [ -f "$SILINX_DIR/bin/silinx.js" ]; then
  node "$SILINX_DIR/bin/silinx.js" toolchain --docker "$TAG"
else
  echo "Configure Silinx: Tools > Toolchain Settings > Docker image = $TAG"
fi
info "done. Keep the image private: it contains AMD/Xilinx software and your license."
