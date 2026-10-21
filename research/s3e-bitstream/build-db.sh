#!/bin/bash
# Rebuilds the bit database from the experiments' results in $W (bitstreams made by ISE; nothing of it
# is in the repository): db/xc3s250e-layout.json, db/xc3s250e-lut.json, the shared tile types
# db/s3e-tiles.json, the XC3S250E's pads (db/xc3s250e-cp132-pads.json), db/xc3s250e-slice.json and
# db/xc3s250e-bram.json, then (stage F) the other devices from $W2, and the PIPs the tiles do not have.
#   research/s3e-bitstream/build-db.sh [W] [W2]
# measure-db.sh makes $W again from nothing, with ISE on another machine (#48; README "Rebuilding the
# database"):
#   $W/map/                  gen-map.mjs (MAP0.bit, EMPTY.bit: the layout, the LUTs, the format)
#   measured/slice/*.json    slice harness results (analyze-slice.mjs), in the repository
#   measured/learn-*, fix-*  features found by ana-residual / ana-attrdrop / ana-pads / learn-single /
#                            explain-diff (see README), in the repository
#   $W/pips/*/               PIP batches (gen-pipdrop.mjs on designs implemented by ISE, gen-clock.mjs,
#                            gen-pipcover.mjs, gen-branch.mjs), each analysed into pips.json
#   $W/io4/, $W/io7/         I/O settings per pad (gen-iob.mjs --perpad, --perstd)
#   $W/br1/                  block-RAM contents (gen-bram.mjs)
#   $W2/s100, s500, s1200/  stage F, per device (PART): map/, iot/ + ios/ (gen-iob.mjs --third / --sparse),
#                            iop/ + iostd/ (--perpad / --perstd), br/ (gen-bram.mjs), s1200/clkhll/
#                            (gen-pipcover.mjs --types CLKH_LL --long 1, ana-pipdrop.mjs)
set -e
W=${1:-${TMPDIR:-/tmp}/silinx-bitdb}; W2=${2:-${TMPDIR:-/tmp}/silinx-bitdb-f}
W=${W%/}; W2=${W2%/}
cd "$(dirname "$0")"
export PART=xc3s250ecp132-4
node decode-map.mjs "$W/map" > /dev/null && cp "$W/map/lut.json" db/xc3s250e-lut.json
node gen-layout.mjs "$W/map/map.json" "$W/map/EMPTY.bit" > db/xc3s250e-layout.json
node gen-slicedb.mjs measured/slice/*.json > "$W/slice-features.json"
echo '{"types":{"CENTER_SMALL_BRK":{"sameAs":"CENTER_SMALL"}}}' > "$W/brk.json"
PIPS=()
for d in "$W"/pips/*/; do
  d=${d%/}
  [ -f "$d/key.json" ] && [ -f "$d/BASE.bit" ] && [ "$(ls "$d" | grep -c "^V.*bit$")" = "$(node -p "require(\"$d/key.json\").L")" ] || continue
  [ -s "$d/pips.json" ] || node ana-pipdrop.mjs "$d" "$PART" > "$d/pips.json"
  PIPS+=("$d/pips.json")
done
node pips-to-db.mjs "${PIPS[@]}" > "$W/pip-features.json" 2> "$W/pip-report.txt"
tail -1 "$W/pip-report.txt"
# (the analyses above read the layout of the database there was; the tile types and the pads are
# made again from here)
node merge-db.mjs --reset-tiles --reset-pads
node merge-db.mjs "$W/slice-features.json" "$W/brk.json" "$W/pip-features.json"
for f in measured/learn-*.json; do [ -f "$f" ] && node merge-db.mjs --keep "$f"; done
node unify-io.mjs
# the I/O, corner, block-RAM interconnect and DCM tiles share the CLB's switch box (stage D)
node share-sb.mjs
# I/O standards, drive, slew and pull per pad (gen-iob.mjs --perpad, stage D)
if [ -f "$W/io4/key.json" ]; then node ana-perpad.mjs "$W/io4" > "$W/perpad.json" && node merge-db.mjs "$W/perpad.json"; fi
if [ -f "$W/io7/key.json" ] && [ -f "$W/io7/LVCMOS12_BASE.bit" ]; then node ana-perpad.mjs "$W/io7" > "$W/perstd.json" && node merge-db.mjs "$W/perstd.json"; fi
# the pads' features of #18 (I:NOLOAD) and #44 (IOB registers, input delays), whose experiments are
# not repeated: kept as numbers (README, "Rebuilding the database")
node merge-db.mjs measured/pads-xc3s250e-cp132.json
# the tile features of earlier experiments that measure-db.sh does not repeat and its designs do not
# reach (the block-RAM and CLB tiles' VCC switches, the DCMs' outputs, the clock tiles' buffers…):
# kept as numbers, only where nothing above measured them (README, "Rebuilding the database")
[ -f measured/kept-xc3s250e.json ] && node merge-db.mjs --keep measured/kept-xc3s250e.json
# corrections found by comparing whole designs with ISE (check-writer.mjs, explain-diff.mjs), and
# of switches the rebuild measured once only with a side effect (fix-26rebuild.json)
for f in measured/fix-*.json; do [ -f "$f" ] && node merge-db.mjs "$f"; done
# the other three DCMs' settings: the top-left one's mirrored (stage F, dcm-mirror.mjs)
node dcm-mirror.mjs > "$W/dcm-mirror.json" && node merge-db.mjs "$W/dcm-mirror.json"

node gen-slicetable.mjs > db/xc3s250e-slice.json
# block-RAM contents (gen-bram.mjs, stage D)
if [ -f "$W/br1/V14.bit" ]; then node ana-bram.mjs "$W/br1" > "$W/bram.json" && cp "$W/bram.json" db/xc3s250e-bram.json; fi

# stage F: the other devices (the shared tile types above serve them; their own layout, LUTs, block
# RAMs, pads, and the XC3S1200E's long-line splitters)
for d in s100:xc3s100ecp132-4:xc3s100e s500:xc3s500efg320-4:xc3s500e s1200:xc3s1200efg320-4:xc3s1200e; do
  IFS=: read -r s p dev <<< "$d"
  [ -d "$W2/$s/map" ] || continue
  export PART=$p
  node decode-map.mjs "$W2/$s/map" > /dev/null && cp "$W2/$s/map/lut.json" "db/$dev-lut.json"
  node gen-layout.mjs "$W2/$s/map/map.json" "$W2/$s/map/EMPTY.bit" > "$W2/$s/layout.json" && cp "$W2/$s/layout.json" "db/$dev-layout.json"
  node merge-db.mjs --reset-pads
  node ana-pads.mjs "$W2/$s/iot" "$W2/$s/ios" > "$W2/$s/pads.json" && node merge-db.mjs "$W2/$s/pads.json"
  [ -f "$W2/$s/iop/key.json" ] && node ana-perpad.mjs "$W2/$s/iop" > "$W2/$s/perpad.json" && node merge-db.mjs "$W2/$s/perpad.json"
  [ -f "$W2/$s/iostd/key.json" ] && node ana-perpad.mjs "$W2/$s/iostd" > "$W2/$s/perstd.json" && node merge-db.mjs "$W2/$s/perstd.json"
  node ana-bram.mjs "$W2/$s/br" > "$W2/$s/bram.json" && cp "$W2/$s/bram.json" "db/$dev-bram.json"
done
if [ -f "$W2/s1200/clkhll/key.json" ]; then
  export PART=xc3s1200efg320-4
  node ana-pipdrop.mjs "$W2/s1200/clkhll" "$PART" > "$W2/s1200/clkhll/pips.json"
  node clkh-ll.mjs "$W2/s1200/clkhll/pips.json" > "$W2/s1200/clkh-ll.json"
  rm -f db/xc3s1200e-tiles.json && node merge-db.mjs --device "$W2/s1200/clkh-ll.json"
  node -e "const fs=require('fs'),f='db/xc3s1200e-tiles.json',t=JSON.parse(fs.readFileSync(f,'utf8'));t.types.CLKH_LL.noRoute=true;fs.writeFileSync(f,JSON.stringify(t))"
fi
# the XC3S1200E's other long-line splitters (#709: CLKV_LL, CLKL_IOIS_LL, CLKR_IOIS_LL; ll-splitters.mjs, noRoute)
[ -f measured/ll-splitters-709.json ] && PART=xc3s1200efg320-4 node merge-db.mjs --device measured/ll-splitters-709.json
# the PIPs of the shared tile types that some or all of a type's tiles do not have (#74)
unset PART
node pip-exceptions.mjs
# the I/O columns' clock rows' bits out of the pads' own features (#671: #44's solution held the writer's error there)
node pad-clock-rows.mjs
# the bits of R:ICLK2INV:#OFF given to the pads they belong to (#671, measured/fix-27iclk2-owners.json)
node pad-owners.mjs
