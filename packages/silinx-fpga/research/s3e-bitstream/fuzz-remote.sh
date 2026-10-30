#!/bin/bash
# Runs run-many.sh on another machine with Docker and the ISE image (faster than emulation): copies
# the folders' .xdl files there, runs ISE in a container, copies the .bit files and logs back.
#   SILINX_FUZZ_HOST=user@host fuzz-remote.sh [-P 3] [-c] dir…      (dirs under $W)
# W: the local experiments folder (default /tmp/claude-501/bg); RW: the folder on the remote machine
# (default silinx-fuzz in its home), mounted as /w in the container like $W locally.
set -e
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
W=${W:-/tmp/claude-501/bg}; RW=${RW:-silinx-fuzz}
# (an absolute RW, e.g. under /Users/Shared/silinx-ise/build where Docker Desktop shares folders, #482; else in the home)
case "$RW" in /*) MNT=$RW ;; *) MNT='$HOME/'$RW ;; esac
OPTS=(); while [[ "$1" == -* ]]; do OPTS+=("$1"); [[ "$1" == -P || "$1" == -g ]] && { OPTS+=("$2"); shift; }; shift; done
SSH=(ssh -o BatchMode=yes -o ServerAliveInterval=60 -o ServerAliveCountMax=10 "$SILINX_FUZZ_HOST")
"${SSH[@]}" "mkdir -p $RW"
rsync -a -e "ssh -o BatchMode=yes -o ServerAliveInterval=60 -o ServerAliveCountMax=10" "$(dirname "$0")/run-many.sh" "$SILINX_FUZZ_HOST:$RW/"
# The results an earlier run left in RW (run-many.sh skips a design whose .bit is there) are reused,
# and copied back below, only for the same input: a design whose .xdl there differs from the local
# one, or has none here, loses its .xdl, .bit and logs there first (a run resumed after the local
# folder was lost: generate the same designs again in W and run this; #48).
reused=0
for d in "$@"; do
  "${SSH[@]}" "mkdir -p $RW/$d"
  here=$(cd "$W/$d" && cksum -- *.xdl | LC_ALL=C sort)
  there=$("${SSH[@]}" "cd $RW/$d && for f in *.xdl; do [ -f \"\$f\" ] && cksum -- \"\$f\"; done" | LC_ALL=C sort)
  stale=$(LC_ALL=C comm -13 <(echo "$here") <(echo "$there") | awk 'NF { sub(/\.xdl$/, "", $3); print $3 }')
  [ -z "$stale" ] || "${SSH[@]}" "cd $RW/$d && for b in $(echo $stale); do rm -f \"\$b\".xdl \"\$b\".bit \"\$b\".crc.bit \"\$b\".*log \"\$b\".ncd \"\$b\".crc.ncd; done"
  n=$("${SSH[@]}" "ls $RW/$d" | grep '\.bit$' | grep -vc '\.crc\.bit$' || true); reused=$((reused + n))
  rsync -a -e "ssh -o BatchMode=yes -o ServerAliveInterval=60 -o ServerAliveCountMax=10" --include='*.xdl' --exclude='*' "$W/$d/" "$SILINX_FUZZ_HOST:$RW/$d/"
done
[ "$reused" = 0 ] || echo "$reused results of an earlier run reused (same .xdl)"
start=$(date +%s)
"${SSH[@]}" "export PATH=\"\$PATH:/usr/local/bin\"; docker run --rm --network none -v \"$MNT\":/w xilinx/ise:14.7 bash /w/run-many.sh ${OPTS[*]} $(printf '/w/%s ' "$@")" | grep -v '^DONE' || true
for d in "$@"; do
  rsync -a -e "ssh -o BatchMode=yes -o ServerAliveInterval=60 -o ServerAliveCountMax=10" --include='*.bit' --include='*log' --exclude='*' "$SILINX_FUZZ_HOST:$RW/$d/" "$W/$d/"
  "${SSH[@]}" "rm -f $RW/$d/*.ncd"
done
echo "$(ls $(printf "$W/%s/*.xdl " "$@") | wc -l | tr -d ' ') designs, $(( $(date +%s) - start )) s"
