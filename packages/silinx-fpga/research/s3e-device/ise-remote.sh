#!/bin/bash
# Runs oracle.sh on a folder of XDL designs on another machine with Docker and the ISE image, and
# brings back the logs (and routed XDL with -r, the .bit with -b). The machine is given on the command line only:
#   SILINX_ISE_HOST=user@host [SILINX_ISE_IMAGE=xilinx/ise:14.7] [RWBASE=/Users/Shared/silinx-ise/build] ise-remote.sh [-P 2] [-r] [-f] [-b] dir
# The remote folder (silinx-device-<pid>, in RWBASE: a folder Docker Desktop shares, #482; else in the home) is
# removed afterwards. A connection lost during the run (ssh's 255, within about 2 minutes, #2019) fails the script
# and keeps that folder: the container may still be working there, and what it holds is fetched when it can be.
set -e
: "${SILINX_ISE_HOST:?set SILINX_ISE_HOST=user@host}"
IMAGE=${SILINX_ISE_IMAGE:-xilinx/ise:14.7}
OPTS=(); while [[ "$1" == -* ]]; do OPTS+=("$1"); [[ "$1" == -P ]] && { OPTS+=("$2"); shift; }; shift; done
D=$(cd "$1" && pwd); N=$(basename "$D"); RW="${RWBASE:+${RWBASE%/}/}silinx-device-$$"
case "$RW" in /*) MNT=$RW ;; *) MNT='$HOME/'$RW ;; esac
SSH=(ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=30 "$SILINX_ISE_HOST")
"${SSH[@]}" "mkdir -p $RW/$N"
trap '[ -n "$LOST" ] || "${SSH[@]}" "rm -rf $RW"' EXIT
rsync -a -e "ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=30" "$(dirname "$0")/oracle.sh" "$SILINX_ISE_HOST:$RW/"
rsync -a -e "ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=30" --include='*.xdl' --exclude='*' "$D/" "$SILINX_ISE_HOST:$RW/$N/"
start=$(date +%s)
set +e
"${SSH[@]}" "export PATH=\"\$PATH:/usr/local/bin\"; docker run --rm --network none -v \"$MNT\":/w $IMAGE bash /w/oracle.sh ${OPTS[*]} /w/$N" | grep -v '^DONE'
rc=${PIPESTATUS[0]}; set -e
if [ "$rc" -eq 255 ]; then
  LOST=1
  rsync -a -e "ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=30" --include='*.log' --include='*.r.xdl' --include='*.bit' --exclude='*' "$SILINX_ISE_HOST:$RW/$N/" "$D/" || true
  echo "ise-remote: the connection was lost during the run; the remote folder $RW is kept, its results are not complete" >&2
  exit 1
fi
rsync -a -e "ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=30" --include='*.log' --include='*.r.xdl' --include='*.bit' --exclude='*' "$SILINX_ISE_HOST:$RW/$N/" "$D/"
echo "$(ls "$D"/*.xdl | grep -vc '\.r\.xdl$') designs, $(( $(date +%s) - start )) s"
