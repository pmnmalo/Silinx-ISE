#!/bin/bash
# #2: the block RAMs' and multipliers' clock pins from every global line (`GCLKk -> BRAM_CLKj` of the block-RAM
# interconnect tiles) and the clock pads' dedicated paths to the top and bottom global buffers (`CLKT_CKIk ->
# CLKT_GCLKj`, `CLKB_CKIk -> CLKB_GCLKj`), measured: the designs of gen-bramclk.mjs (every clock pin of every block RAM
# and multiplier on the line of a switch not measured yet; on the XC3S250E twice, the switches on other sites the
# second time, and once on the XC3S1200E) and of gen-clkpad.mjs (each buffer from each of its two pads, c0 / c1)
# implemented by ISE (impl-remote.sh), every PIP of each routed design removed by codewords
# (gen-pipdrop.mjs, xdl + bitgen on the ISE machine: fuzz-remote.sh) and analysed (ana-pipdrop.mjs); then
# pips-to-db.mjs gives the features of each device. ISE's outputs stay in W, out of the repository.
#   SILINX_FUZZ_HOST=user@host [RWBASE=/Users/Shared/silinx-ise/build] research/s3e-bitstream/measure-bramclk.sh [W]
# RWBASE: the folder on the ISE machine (absolute: where Docker Desktop shares folders, #482; else the home)
set -e
cd "$(dirname "$0")"
export W=${1:-${TMPDIR:-/tmp}/silinx-bramclk}; W=${W%/}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
R=${RWBASE:+${RWBASE%/}/}
PIPS=()
for spec in 'xc3s250ecp132-4:2' 'xc3s1200efg320-4:1'; do
  part=${spec%%:*}; rep=${spec#*:}
  dash=$(echo "$part" | sed -E 's/^(xc3s[0-9]+e)([a-z]+[0-9]+)-/\1-\2-/')
  [ -d "$W/$part/r0" ] || PART=$part node gen-bramclk.mjs "$W/$part" --repeat "$rep"
  [ -d "$W/$part/c0" ] || PART=$part node gen-clkpad.mjs "$W/$part"
  todo=(); for d in "$W/$part"/[rmc][0-9]*/; do r=$(basename "$d"); [ -s "$d/top.xdl" ] || todo+=("$part/$r"); done
  [ ${#todo[@]} -eq 0 ] || W="$W" RW=${R}silinx-bramclk-impl PART=$dash bash impl-remote.sh -P 2 "${todo[@]}"
  for d in "$W/$part"/[rmc][0-9]*/; do
    r=$(basename "$d")
    [ -s "$d/top.xdl" ] || { echo "$part/$r: not implemented (map.log, par.log)"; continue; }
    [ -f "$W/$part/pd-$r/key.json" ] || PART=$part node gen-pipdrop.mjs "$d/top.xdl" "$W/$part/pd-$r" 20 3 1
    n=$(ls "$W/$part/pd-$r"/*.xdl | wc -l)
    [ "$(ls "$W/$part/pd-$r" | grep '\.bit$' | grep -vc '\.crc\.bit$')" -ge "$n" ] || W="$W" RW=${R}silinx-bramclk bash fuzz-remote.sh -P 3 "$part/pd-$r"
    [ -s "$W/$part/pd-$r/pips.json" ] || PART=$part node ana-pipdrop.mjs "$W/$part/pd-$r" "$part" > "$W/$part/pd-$r/pips.json"
    PIPS+=("$part:$W/$part/pd-$r/pips.json")
  done
done
for part in xc3s250ecp132-4 xc3s1200efg320-4; do
  files=(); for x in "${PIPS[@]}"; do [ "${x%%:*}" = "$part" ] && files+=("${x#*:}"); done
  [ ${#files[@]} -eq 0 ] || PART=$part node pips-to-db.mjs "${files[@]}" > "$W/$part-features.json" 2> "$W/$part-report.txt"
done
echo "features per device in $W/<part>-features.json (reports in <part>-report.txt)"
