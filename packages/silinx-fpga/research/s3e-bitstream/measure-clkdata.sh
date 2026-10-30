#!/bin/bash
# #957: the switches that take a clock into the fabric (DCM_<output> -> OMUXk, CLK[TB]_GCLK_MAINk -> CLK[TB]_TO_OMUXj),
# measured on designs ISE routed (#862's, measure-dcmomux.sh: every DCM's outputs on global buffers) with each unknown
# switch added as a branch (gen-clkdata.mjs), every PIP removed by codewords (gen-pipdrop.mjs, xdl + bitgen on the ISE
# machine: fuzz-remote.sh), ana-pipdrop.mjs, pips-to-db.mjs. ISE's outputs stay in W, out of the repository.
#   SILINX_FUZZ_HOST=user@host [RWBASE=/Users/Shared/silinx-ise/build] research/s3e-bitstream/measure-clkdata.sh W ROUTED
# ROUTED: measure-dcmomux.sh's folder (ROUTED/<part>/r*/top.xdl, the designs ISE implemented)
set -e
cd "$(dirname "$0")"
export W=${1:?W}; W=${W%/}; ROUTED=${2:?ROUTED}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
R=${RWBASE:+${RWBASE%/}/}
for part in xc3s250ecp132-4 xc3s1200efg320-4; do
  [ -d "$W/$part/a0" ] || PART=$part node gen-clkdata.mjs "$W/$part" "$ROUTED/$part"/r*/top.xdl
  files=()
  for d in "$W/$part"/a*/; do
    a=$(basename "$d")
    [ -f "$W/$part/pd-$a/key.json" ] || PART=$part node gen-pipdrop.mjs "$d/top.xdl" "$W/$part/pd-$a" 20 3 1
    n=$(ls "$W/$part/pd-$a"/*.xdl | wc -l)
    [ "$(ls "$W/$part/pd-$a" | grep '\.bit$' | grep -vc '\.crc\.bit$')" -ge "$n" ] || W="$W" RW=${R}silinx-clkdata bash fuzz-remote.sh -P 3 "$part/pd-$a"
    [ -s "$W/$part/pd-$a/pips.json" ] || PART=$part node ana-pipdrop.mjs "$W/$part/pd-$a" "$part" > "$W/$part/pd-$a/pips.json"
    files+=("$W/$part/pd-$a/pips.json")
  done
  PART=$part node pips-to-db.mjs "${files[@]}" > "$W/$part-features.json" 2> "$W/$part-report.txt"
done
echo "features per device in $W/<part>-features.json (reports in <part>-report.txt)"
