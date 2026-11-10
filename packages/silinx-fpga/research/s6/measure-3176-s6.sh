#!/bin/bash
# #3176: the PIPs of the Spartan-6's top-right corner tiles (UR_UPPER, UR_LOWER) that connect the four BSCAN_SPARTAN6
# sites to the fabric: designs of each JTAG chain (gen-bscan6.mjs) implemented by ISE from HDL (ise-s6.sh impl), each
# routed design again without the PIPs of its tiles other than the INT-like and CLB ones (gen-pipdrop6.mjs, --split 4
# too), turned into bitstreams by ISE (ise-xdl-bits.sh), on the ISE machine; then node research/s6/ana-pipdrop6.mjs on
# the folder (the bits by tile and PIP: $W/bscan-pips.json). ISE's outputs stay in W, out of the repository.
#   SILINX_ISE_HOST=user@host [RW=/Users/Shared/silinx-ise/build/silinx-3176-s6] [PART=xc6slx16-csg324-3] sh research/s6/measure-3176-s6.sh W
# (RW: the folder on the ISE machine, one Docker Desktop shares, #482; the host on the command line only)
set -e
: "${SILINX_ISE_HOST:?set SILINX_ISE_HOST=user@host}"
cd "$(dirname "$0")"
W=${1:?W}; W=${W%/}; mkdir -p "$W"
RW=${RW:-/Users/Shared/silinx-ise/build/silinx-3176-s6}; PART=${PART:-xc6slx16-csg324-3}
SSHO="ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=30"
SSH=($SSHO "$SILINX_ISE_HOST")
DOCKER="export PATH=\"\$PATH:/usr/local/bin\"; docker run --rm --network none -v \"$RW\":/w xilinx/ise:14.7 bash"
DESIGNS=$(node gen-bscan6.mjs "$W/impl" "$PART")
"${SSH[@]}" "mkdir -p $RW"
rsync -a -e "$SSHO" ise-s6.sh ise-xdl-bits.sh "$SILINX_ISE_HOST:$RW/"
# the designs from their HDL (2 containers), the routed XDL back
todo=(); for d in $DESIGNS; do [ -s "$W/impl/$d/top.xdl" ] || todo+=("$d"); done
if [ ${#todo[@]} -gt 0 ]; then
  rsync -a -e "$SSHO" --include='*/' --include='*.v' --include='*.ucf' --include='top.txt' --exclude='*' "$W/impl/" "$SILINX_ISE_HOST:$RW/impl/"
  pids=()
  for k in 0 1; do
    set_k=(); i=0; for d in "${todo[@]}"; do (( i % 2 == k )) && set_k+=("/w/impl/$d"); i=$((i + 1)); done
    [ ${#set_k[@]} -eq 0 ] && continue
    "${SSH[@]}" "$DOCKER /w/ise-s6.sh impl $PART ${set_k[*]}" & pids+=($!)
  done
  for p in "${pids[@]}"; do wait "$p" || true; done
  rsync -a -e "$SSHO" --include='*/' --include='top.xdl' --include='top.bit' --include='*.log' --include='*.mrp' --include='*.twr' --exclude='*' "$SILINX_ISE_HOST:$RW/impl/" "$W/impl/"
fi
# each design as it is and without its other tiles' PIPs (and a quarter of them at a time), through xdl and bitgen
args=(); for d in $DESIGNS; do [ -s "$W/impl/$d/top.xdl" ] || { echo "$d: not implemented (map.log, par.log)"; exit 1; }; args+=("$d=$W/impl/$d/top.xdl"); done
[ -d "$W/drop" ] || { node gen-pipdrop6.mjs "$W/drop" "${args[@]}" > /dev/null; node gen-pipdrop6.mjs --split 4 "$W/drop" "${args[@]}" > /dev/null; }
rsync -a -e "$SSHO" --include='*.xdl' --exclude='*' "$W/drop/" "$SILINX_ISE_HOST:$RW/drop/"
"${SSH[@]}" "$DOCKER /w/ise-xdl-bits.sh /w/drop" | grep -i failed || true
rsync -a -e "$SSHO" --include='*.bit' --include='*.blog' --include='*.xlog' --exclude='*' "$SILINX_ISE_HOST:$RW/drop/" "$W/drop/"
echo "$(ls "$W/drop"/*.bit | wc -l | tr -d ' ') bitstreams in $W/drop"
# their PIPs (the ones the database has not yet go to db/s6-pips-bscan.json; the chain's bit, the one bit left, to
# db/s6-bscan.json: check-bitgen6.mjs on $W/impl/*)
node ana-pipdrop6.mjs --out "$W/bscan-pips.json" "$W/drop" | tail -1
