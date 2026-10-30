#!/bin/bash
# The experiments of the XC3S250E's bit database (stages A-E), made again from nothing (#48): every
# design is written here by Silinx's scripts with fixed parameters (the fixtures' HDL designs are
# implemented by ISE), converted by ISE's xdl + bitgen on a machine with the ISE Docker image
# (fuzz-remote.sh, impl-remote.sh), and left with ISE's .bit files and logs in $W, out of the
# repository, for build-db.sh:
#   SILINX_FUZZ_HOST=user@host research/s3e-bitstream/measure-db.sh [W]     (the host on the command line only)
#   research/s3e-bitstream/build-db.sh W                                     (then: git diff, diff-db.mjs)
# W (default $TMPDIR/silinx-bitdb): map/ (stage A), br1/ (block-RAM contents), io4/, io7/ (I/O settings
# per pad and per standard), impl/ (the fixtures implemented by ISE), pips/<batch>/ (routing switches,
# each batch analysed into pips.json), ref-db/ (a copy of db/ as it was: the database to measure again).
# The routing switches measured are the ones the database holds (want-pips.mjs: the candidates of
# every batch), in this order: the switches of designs implemented by ISE, removed by codewords
# (gen-pipdrop.mjs), the global clock tree (gen-clock.mjs), test designs routed through the switches
# (gen-pipcover.mjs --want, rounds with the slice pins, carry, clock, constant, block-RAM pins, long
# lines, dead ends), and the rest as dead-end branches of those designs' nets (gen-branch.mjs). Each
# step is skipped when its results are there (a run can be resumed). With W lost but the remote work
# folders (RW, RW-impl) still on the ISE machine: run on a new W; the same designs are written again
# and fuzz-remote.sh / impl-remote.sh reuse the remote results of the same inputs only. About 6-8
# hours of ISE.
set -e
cd "$(dirname "$0")"
export W=${1:-${TMPDIR:-/tmp}/silinx-bitdb}; W=${W%/}
export PART=${PART:-xc3s250ecp132-4}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
export RW=${RW:-silinx-measure-db}
mkdir -p "$W/pips" "$W/impl"
[ -d "$W/ref-db" ] || cp -R db "$W/ref-db"
# ISE on a folder of $W, unless its .bit files are all there
fuzz() { local n; n=$(ls "$W/$1"/*.xdl | wc -l); [ "$(ls "$W/$1" | grep -c '\.bit$')" -ge "$n" ] || bash fuzz-remote.sh -P "${P:-3}" "$1"; }
# a PIP batch: ISE, then its analysis
batch() { fuzz "pips/$1" && { [ -s "$W/pips/$1/pips.json" ] || node ana-pipdrop.mjs "$W/pips/$1" "$PART" > "$W/pips/$1/pips.json"; }; }
want() { node want-pips.mjs "$W/ref-db" "$W" > "$W/want.json" 2>> "$W/want.log"; tail -1 "$W/want.log"; node -p "Object.values(require('$W/want.json')).flat().length"; }

# stage A: every slice numbered in its LUT, and the empty design
[ -f "$W/map/EMPTY.xdl" ] || node gen-map.mjs "$W/map"
fuzz map
# block-RAM contents, I/O settings per pad and per I/O standard
[ -f "$W/br1/key.json" ] || node gen-bram.mjs "$PART" "$W/br1"
fuzz br1
[ -f "$W/io4/key.json" ] || node gen-iob.mjs "$PART" "$W/io4" --perpad
[ -f "$W/io7/key.json" ] || node gen-iob.mjs "$PART" "$W/io7" --perstd
fuzz io4; fuzz io7

# routing switches (1): the fixtures implemented by ISE from HDL (on the XC3S250E: the pins of the
# other boards' designs left to ISE), every PIP removed by codewords (20 variants)
FIX=../../../../test/fixtures/designs
IMPL=()
for d in bram_prim bram_sp bufgmux dcm dram mult srl; do
  mkdir -p "$W/impl/$d"
  cp "$FIX/$d"/*.v "$FIX/$d"/*.vhd "$W/impl/$d/" 2>/dev/null || true
  rm -f "$W/impl/$d/harness.vhd"
  if grep -q '"part": "xc3s250e"' "$FIX/$d/design.json"; then cp "$FIX/$d/top.ucf" "$W/impl/$d/"; else grep -v 'LOC' "$FIX/$d/top.ucf" > "$W/impl/$d/top.ucf"; fi
  # (not again when ISE's map refused it: bram_prim and mult need more pads than the CP132 has)
  [ -s "$W/impl/$d/top.xdl" ] || grep -qs '^ERROR:Pack' "$W/impl/$d/map.log" || IMPL+=("impl/$d")
done
[ ${#IMPL[@]} -eq 0 ] || W="$W" RW="$RW-impl" PART=xc3s250e-cp132-4 bash impl-remote.sh -P 2 "${IMPL[@]}"
for d in "$W"/impl/*/; do
  d=$(basename "$d"); [ -s "$W/impl/$d/top.xdl" ] || { echo "impl/$d: not implemented"; continue; }
  [ -f "$W/pips/pd-$d/key.json" ] || node gen-pipdrop.mjs "$W/impl/$d/top.xdl" "$W/pips/pd-$d" 20 3 1
  batch "pd-$d"
done
# (2) the global clock tree: 8 buffers, clock pins above and below every horizontal clock row
[ -f "$W/pips/k1/key.json" ] || node gen-clock.mjs "$PART" "$W/pips/k1"
batch k1

# (3) test designs routed through the switches still to measure: rounds through the kinds of pins
# and lines, until a whole cycle of them measures nothing new
OPTS=('--pins lut' '--pins all' '--pins all,carry' '--pins lut,clk' '--pins lut,vcc' '--pins lut,bram' '--long 1' '--pins all --nosink 1')
r=0; idle=0
while [ "$idle" -lt ${#OPTS[@]} ] && [ "$r" -lt "${ROUNDS:-80}" ]; do
  name=$(printf c%02d "$r")
  # (a run resumed: the rounds an earlier run made count as they did then, an empty one as idle, one
  # with results by the number of switches it measured first, in new; so the rounds go on as they did)
  if [ ! -d "$W/pips/$name" ] && grep -qs '^0 nets' "$W/pips/$name.txt"; then idle=$((idle + 1)); r=$((r + 1)); continue; fi
  if [ -s "$W/pips/$name/pips.json" ] && [ -s "$W/pips/$name/new" ]; then
    if [ "$(cat "$W/pips/$name/new")" -gt 0 ]; then idle=0; else idle=$((idle + 1)); fi
    r=$((r + 1)); continue
  fi
  if [ ! -f "$W/pips/$name/key.json" ]; then
    left=$(want | tail -1); [ "$left" = 0 ] && break
    # (an option that reaches none of the switches left gives a design without nets)
    node gen-pipcover.mjs "$PART" "$W/pips/$name" --want "$W/want.json" --k 8 --seed $((r + 1)) ${OPTS[$((r % ${#OPTS[@]}))]} | tee "$W/pips/$name.txt"
    if grep -q '^0 nets' "$W/pips/$name.txt"; then rm -rf "$W/pips/$name"; idle=$((idle + 1)); r=$((r + 1)); continue; fi
  fi
  before=$(want | tail -1)
  batch "$name"
  after=$(want | tail -1)
  echo $((before - after)) > "$W/pips/$name/new"
  if [ "$after" -lt "$before" ]; then idle=0; else idle=$((idle + 1)); fi
  r=$((r + 1))
done

# (4) the rest as dead-end branches of the nets of the designs above (no sink needed: the clock pins,
# the stub wires, the pins of sites no test net drives)
b=0
for base in "$W"/pips/k1/BASE.xdl "$W"/pips/c*/BASE.xdl "$W"/pips/pd-*/BASE.xdl; do
  [ -f "$base" ] || continue
  name=$(printf b%02d "$b")
  if [ ! -f "$W/pips/$name/key.json" ]; then
    left=$(want | tail -1); [ "$left" = 0 ] && break
    node gen-branch.mjs "$PART" "$base" "$W/pips/$name" --want "$W/want.json" --k 30 --L 12 --seed $((b + 1)) | tee "$W/pips/$name.txt" || { rm -rf "$W/pips/$name"; continue; }
    if grep -q '^0 ' "$W/pips/$name.txt"; then rm -rf "$W/pips/$name"; continue; fi
  fi
  batch "$name"
  b=$((b + 1))
done
want > /dev/null
echo "measured: $(tail -1 "$W/want.log")"
