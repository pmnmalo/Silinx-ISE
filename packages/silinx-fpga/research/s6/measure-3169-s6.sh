#!/bin/bash
# #3169: the PIPs of the Spartan-6's TIOB_SINGLE and BIOB_SINGLE tiles that take a pad's input to its IBUF wire: one
# design per pad of those tiles (gen-padsingle6.mjs) implemented by ISE from HDL (ise-s6.sh impl), each routed design
# again without the PIPs of its tiles other than the INT-like and CLB ones (gen-pipdrop6.mjs, --split 4 too), turned
# into bitstreams by ISE (ise-xdl-bits.sh), on the ISE machine; then node research/s6/ana-pipdrop6.mjs on the folder
# (the bits by tile and PIP: $W/single-pips.json). GEN=gen-padout6.mjs OUT=outer-pips.json: the TIOI_OUTER slave
# outputs (#3350) the same way. As measure-3176-s6.sh, but one ISE container at a time, each started
# when the machine runs at most one other (docker ps). ISE's outputs stay in W, out of the repository.
#   SILINX_ISE_HOST=user@host [SILINX_ISE_SSH_ARGS="-i key -p port"] [RW=<folder>] [PART=xc6slx16-csg324-3]
#     [IMAGE=xilinx/ise:14.7] [GEN=gen-padsingle6.mjs] [OUT=single-pips.json] bash research/s6/measure-3169-s6.sh W
# (RW: the folder on the ISE machine, absolute (one Docker Desktop shares, #482) or in its home, default silinx-3169-s6;
# the host on the command line only)
set -e
: "${SILINX_ISE_HOST:?set SILINX_ISE_HOST=user@host}"
cd "$(dirname "$0")"
W=${1:?W}; W=${W%/}; mkdir -p "$W"
RW=${RW:-silinx-3169-s6}; PART=${PART:-xc6slx16-csg324-3}; IMAGE=${IMAGE:-xilinx/ise:14.7}
GEN=${GEN:-gen-padsingle6.mjs}; OUT=${OUT:-single-pips.json}
case "$RW" in /*) MNT=$RW ;; *) MNT='$HOME/'$RW ;; esac
SSHO="ssh $SILINX_ISE_SSH_ARGS -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=30"
SSH=($SSHO "$SILINX_ISE_HOST")
PATHX='export PATH="$PATH:/usr/local/bin";'
DOCKER="$PATHX docker run --rm --network none -v \"$MNT\":/w $IMAGE bash"
# wait until the ISE machine runs at most one ISE container (another job's)
ise_free() { until [ "$("${SSH[@]}" "$PATHX docker ps --format '{{.Image}}' | grep -c ise || true")" -le 1 ]; do sleep 60; done; }
DESIGNS=$(node "$GEN" "$W/impl" "$PART")
"${SSH[@]}" "mkdir -p $RW"
rsync -a -e "$SSHO" ise-s6.sh ise-xdl-bits.sh "$SILINX_ISE_HOST:$RW/"
# the designs from their HDL, the routed XDL back
todo=(); for d in $DESIGNS; do [ -s "$W/impl/$d/top.xdl" ] || todo+=("/w/impl/$d"); done
if [ ${#todo[@]} -gt 0 ]; then
  rsync -a -e "$SSHO" --include='*/' --include='*.v' --include='*.ucf' --include='top.txt' --exclude='*' "$W/impl/" "$SILINX_ISE_HOST:$RW/impl/"
  ise_free
  "${SSH[@]}" "$DOCKER /w/ise-s6.sh impl $PART ${todo[*]}" || true
  rsync -a -e "$SSHO" --include='*/' --include='top.xdl' --include='top.bit' --include='*.log' --include='*.mrp' --include='*.twr' --exclude='*' "$SILINX_ISE_HOST:$RW/impl/" "$W/impl/"
fi
# each design as it is and without its other tiles' PIPs (and a quarter of them at a time), through xdl and bitgen
args=(); for d in $DESIGNS; do [ -s "$W/impl/$d/top.xdl" ] || { echo "$d: not implemented (map.log, par.log)"; exit 1; }; args+=("$d=$W/impl/$d/top.xdl"); done
[ -d "$W/drop" ] || { node gen-pipdrop6.mjs "$W/drop" "${args[@]}" > /dev/null; node gen-pipdrop6.mjs --split 4 "$W/drop" "${args[@]}" > /dev/null; }
rsync -a -e "$SSHO" --include='*.xdl' --exclude='*' "$W/drop/" "$SILINX_ISE_HOST:$RW/drop/"
ise_free
"${SSH[@]}" "$DOCKER /w/ise-xdl-bits.sh /w/drop" | grep -i failed || true
rsync -a -e "$SSHO" --include='*.bit' --include='*.blog' --include='*.xlog' --exclude='*' "$SILINX_ISE_HOST:$RW/drop/" "$W/drop/"
echo "$(ls "$W/drop"/*.bit | wc -l | tr -d ' ') bitstreams in $W/drop"
# their PIPs (the ones the database has not yet go to db/s6-pips-io.json); then check-bitgen6.mjs on $W/impl/*
node ana-pipdrop6.mjs --out "$W/$OUT" "$W/drop=${PART/-csg324-3/csg324-3}" | tail -1
