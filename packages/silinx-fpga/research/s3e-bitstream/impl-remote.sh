#!/bin/bash
# Runs ise-impl.sh on another machine with Docker and the ISE image: copies the design folders there,
# implements them with ISE for PART (P containers at a time), copies the routed XDL, the bitstreams and
# the logs back.
#   SILINX_FUZZ_HOST=user@host PART=xc3s500e-fg320-4 impl-remote.sh [-P 4] dir…      (dirs under $W)
# W: the local experiments folder (default /tmp/claude-501/bg2); RW: the folder on the remote machine
# (default silinx-fuzz2 in its home). The host is given on the command line only.
set -e
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
W=${W:-/tmp/claude-501/bg2}; RW=${RW:-silinx-fuzz2}; PART=${PART:-xc3s250e-cp132-4}
# (an absolute RW, e.g. under /Users/Shared/silinx-ise/build where Docker Desktop shares folders, #482; else in the home)
case "$RW" in /*) MNT=$RW ;; *) MNT='$HOME/'$RW ;; esac
P=4; if [ "$1" = -P ]; then P=$2; shift 2; fi
SSH=(ssh -o BatchMode=yes -o ServerAliveInterval=60 -o ServerAliveCountMax=10 "$SILINX_FUZZ_HOST")
"${SSH[@]}" "mkdir -p $RW"
rsync -a -e "ssh -o BatchMode=yes -o ServerAliveInterval=60 -o ServerAliveCountMax=10" "$(dirname "$0")/ise-impl.sh" "$SILINX_FUZZ_HOST:$RW/"
# A design folder an earlier run left in RW (ise-impl.sh skips a design with a top.bit) is reused, and
# its results copied back below, only when its HDL and constraints are the local ones; otherwise it is
# removed there first (#48).
for d in "$@"; do
  here=$(cd "$W/$d" && for f in *.vhd *.v *.ucf; do [ -f "$f" ] && cksum -- "$f"; done | LC_ALL=C sort)
  there=$("${SSH[@]}" "cd $RW/$d 2>/dev/null && for f in *.vhd *.v *.ucf; do [ -f \"\$f\" ] && cksum -- \"\$f\"; done" | LC_ALL=C sort)
  if [ -n "$there" ] && [ "$here" != "$there" ]; then "${SSH[@]}" "rm -rf $RW/$d"; fi
  [ -n "$there" ] && [ "$here" = "$there" ] && echo "$d: the earlier run's folder reused (same HDL and constraints)"
  "${SSH[@]}" "mkdir -p $RW/$d"
  rsync -a -e "ssh -o BatchMode=yes -o ServerAliveInterval=60 -o ServerAliveCountMax=10" --include='*.vhd' --include='*.v' --include='*.ucf' --exclude='*' "$W/$d/" "$SILINX_FUZZ_HOST:$RW/$d/"
done
start=$(date +%s)
# P containers, each with every P-th design
pids=()
for ((k = 0; k < P; k++)); do
  set_k=(); i=0; for d in "$@"; do (( i % P == k )) && set_k+=("/w/$d"); i=$((i + 1)); done
  [ ${#set_k[@]} -eq 0 ] && continue
  "${SSH[@]}" "export PATH=\"\$PATH:/usr/local/bin\"; docker run --rm --network none -e PART=$PART -v \"$MNT\":/w xilinx/ise:14.7 bash /w/ise-impl.sh ${set_k[*]}" &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p" || true; done
for d in "$@"; do
  rsync -a -e "ssh -o BatchMode=yes -o ServerAliveInterval=60 -o ServerAliveCountMax=10" --include='top.xdl' --include='top.bit' --include='top.crc.bit' --include='*.log' --include='*.twr' --exclude='*' "$SILINX_FUZZ_HOST:$RW/$d/" "$W/$d/"
done
echo "$# designs implemented for $PART, $(( $(date +%s) - start )) s"
