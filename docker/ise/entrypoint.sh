#!/bin/bash
# Silinx ISE image entrypoint: works under any UID (docker run --user), loads the ISE
# environment, then runs the given command (default: bash). Example:
#   docker run --rm -v "$PWD:/work" xilinx/ise:14.7 bash run.sh
if [ -z "${HOME:-}" ] || [ "$HOME" = "/" ] || [ ! -w "$HOME" ]; then
  export HOME=/tmp/silinx-home
  mkdir -p "$HOME"
fi
mkdir -p "$HOME/.Xilinx" 2>/dev/null || true
# settings64.sh reads $1 as an install directory, so source it without positional arguments.
silinx_load_ise() { set --; . /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1; }
silinx_load_ise
exec "$@"
