#!/usr/bin/env bash
# Installs adepttool (open-source driver for the Digilent Adept USB programmer of the Basys2,
# https://github.com/mwkmwkmwk/adepttool, MIT licence) into ~/.silinx/adepttool with its own
# Python virtualenv. On macOS it uses Homebrew's Python + libusb (the system Python cannot load
# Homebrew libraries because of SIP).
set -euo pipefail
ROOT="${SILINX_CONFIG_DIR:-$HOME/.silinx}/adepttool"
REPO="https://github.com/mwkmwkmwk/adepttool.git"

PY=""
for c in /opt/homebrew/bin/python3 /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /usr/local/bin/python3 python3; do
  if command -v "$c" >/dev/null 2>&1; then PY="$(command -v "$c")"; break; fi
done
[ -n "$PY" ] || { echo "Python 3 not found (macOS: brew install python)"; exit 1; }
if [ "$(uname)" = "Darwin" ] && [ ! -e /opt/homebrew/lib/libusb-1.0.dylib ] && [ ! -e /usr/local/lib/libusb-1.0.dylib ]; then
  echo "libusb not found: brew install libusb"; exit 1
fi

mkdir -p "$ROOT"
if [ -d "$ROOT/src/.git" ]; then git -C "$ROOT/src" pull --ff-only; else git clone --depth 1 "$REPO" "$ROOT/src"; fi
# Silinx patch: claim the USB interface (required by libusb on macOS) and add the
# XC3S250E/500E/1200E/1600E IDCODEs (upstream only knows the Basys2-100E's XC3S100E).
PATCH="$(cd "$(dirname "$0")" && pwd)/adepttool-silinx.patch"
if git -C "$ROOT/src" apply --check "$PATCH" 2>/dev/null; then git -C "$ROOT/src" apply "$PATCH"; echo "applied $PATCH"; fi
"$PY" -m venv "$ROOT/venv"
"$ROOT/venv/bin/python" -m pip install --quiet --upgrade pip
# The repo pins libusb1==1.6.6, which no longer builds on current Python; the usb1 API is unchanged.
"$ROOT/venv/bin/python" -m pip install --quiet -r "$ROOT/src/requirements.txt" 2>/dev/null \
  || "$ROOT/venv/bin/python" -m pip install --quiet "libusb1>=3"

LIBS="/opt/homebrew/lib:/usr/local/lib"
DYLD_FALLBACK_LIBRARY_PATH="$LIBS" PYTHONPATH="$ROOT/src" "$ROOT/venv/bin/python" -c "import usb1; c = usb1.USBContext(); c.open(); print('libusb OK, version', usb1.getVersion())"
echo "adepttool installed in $ROOT"
echo "Test with the Basys2 connected:  DYLD_FALLBACK_LIBRARY_PATH=$LIBS PYTHONPATH=$ROOT/src $ROOT/venv/bin/python $ROOT/src/list.py"
