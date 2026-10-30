#!/bin/bash
# Night 1 of the Spartan-6 measurements (#733) on the machine with Docker and the ISE image: copies the
# work folder of night1.mjs there, runs ise-s6.sh (the two device reports, the empty designs, the
# examples from their HDL and from the open synthesis's netlists, 3 containers at a time), copies back
# what summarize-night1.mjs reads (never into the repository) and prints how long each part took.
#   SILINX_ISE_HOST=user@host sh research/s6/night1-remote.sh <work folder> [report|empty|impl|edif]…
# With no part named, all four, in that order. RW: the folder on the remote machine (default silinx-s6
# in its home). The host is given on the command line only.
set -e
: "${SILINX_ISE_HOST:?set SILINX_ISE_HOST=user@host}"
W=$(cd "$1" && pwd); shift
RW=${RW:-silinx-s6}; P=${P:-3}
PARTS=("$@"); [ ${#PARTS[@]} -eq 0 ] && PARTS=(report empty impl edif)
SSHO="ssh -o BatchMode=yes -o ServerAliveInterval=60 -o ServerAliveCountMax=10"
SSH=($SSHO "$SILINX_ISE_HOST")
DOCKER="export PATH=\"\$PATH:/usr/local/bin\"; docker run --rm --network none -v \"\$HOME/$RW\":/w xilinx/ise:14.7 bash /w/ise-s6.sh"
"${SSH[@]}" "mkdir -p $RW"
rsync -a -e "$SSHO" "$(dirname "$0")/ise-s6.sh" "$SILINX_ISE_HOST:$RW/"
# (the inputs only: not ISE's outputs copied back by an earlier run; the empty designs are .xdl inputs)
rsync -a -e "$SSHO" --exclude='*.bit' --exclude='*.ncd' --exclude='top.xdl' --exclude='top_map.xdl' --exclude='*.log' --exclude='*.twr' --exclude='*.mrp' --exclude='*.xdlrc.gz' "$W/" "$SILINX_ISE_HOST:$RW/"
parts() { node -e 'const m=require(process.argv[1]);for(const b of Object.values(m.boards))console.log(b.part)' "$W/manifest.json"; }
boards() { node -e 'const m=require(process.argv[1]);for(const [k,b] of Object.entries(m.boards))console.log(k+" "+b.part+" "+Object.keys(b.examples).join(","))' "$W/manifest.json"; }
for part in "${PARTS[@]}"; do
  start=$(date +%s)
  case "$part" in
    # (one report at a time: the XC6SLX45's needs much of the memory of a small machine)
    report) for p in $(parts); do "${SSH[@]}" "$DOCKER report $(echo "$p" | sed 's/-\([a-z]\)/\1/') /w/reports"; done ;;
    empty) "${SSH[@]}" "$DOCKER empty /w/empty" ;;
    impl|edif)
      boards | while read -r board pt list; do
        dirs=(); for e in ${list//,/ }; do dirs+=("/w/$part-$board/$e"); done
        pids=()
        for ((k = 0; k < P; k++)); do
          set_k=(); i=0; for d in "${dirs[@]}"; do (( i % P == k )) && set_k+=("$d"); i=$((i + 1)); done
          [ ${#set_k[@]} -eq 0 ] && continue
          "${SSH[@]}" "$DOCKER $part $pt ${set_k[*]}" & pids+=($!)
        done
        for p in "${pids[@]}"; do wait "$p" || true; done
      done ;;
    *) echo "unknown part $part"; exit 2 ;;
  esac
  echo "== $part: $(( $(date +%s) - start )) s"
done
# back: the summaries, the logs and reports summarize-night1.mjs reads, the bitstreams and XDL (in the work folder only)
rsync -a -e "$SSHO" --include='*/' --include='*.summary.txt' --include='*.xdlrc.gz' --include='times.txt' --include='*.mrp' --include='*.twr' --include='par.log' \
  --include='map.log' --include='top.xdl' --include='top_map.xdl' --include='*.bit' --include='*.blog' --include='*.xlog' --exclude='*' "$SILINX_ISE_HOST:$RW/" "$W/"
echo "results in $W (outside the repository); next: node research/s6/summarize-night1.mjs $W"
