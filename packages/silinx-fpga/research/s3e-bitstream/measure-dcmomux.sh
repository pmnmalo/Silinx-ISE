#!/bin/bash
# #2: the DCMs' output multiplexer (DCM_<output> -> OMUXk of every DCM tile type), measured: the designs of
# gen-dcmomux.mjs (every output of every DCM through each line of its multiplexer, on the XC3S250E for the four corner
# DCM types and on the XC3S1200E for its four side ones) implemented by ISE (impl-remote.sh), every PIP of each routed
# design removed by codewords (gen-pipdrop.mjs, xdl + bitgen on the ISE machine: fuzz-remote.sh) and analysed
# (ana-pipdrop.mjs); then pips-to-db.mjs gives the features of each device. ISE's outputs stay in W, out of the
# repository.
#   SILINX_FUZZ_HOST=user@host research/s3e-bitstream/measure-dcmomux.sh [W]
set -e
cd "$(dirname "$0")"
export W=${1:-${TMPDIR:-/tmp}/silinx-dcmomux}; W=${W%/}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
PIPS=()
for spec in 'xc3s250ecp132-4:' 'xc3s1200efg320-4:^DCM_X[03]Y[12]$'; do
  part=${spec%%:*}; dcms=${spec#*:}
  dash=$(echo "$part" | sed -E 's/^(xc3s[0-9]+e)([a-z]+[0-9]+)-/\1-\2-/')
  [ -d "$W/$part/r0" ] || PART=$part DCMS=$dcms node gen-dcmomux.mjs "$W/$part"
  todo=(); for d in "$W/$part"/r*/; do r=$(basename "$d"); [ -s "$d/top.xdl" ] || todo+=("$part/$r"); done
  [ ${#todo[@]} -eq 0 ] || W="$W" RW=silinx-dcmomux-impl PART=$dash bash impl-remote.sh -P 3 "${todo[@]}"
  for d in "$W/$part"/r*/; do
    r=$(basename "$d")
    [ -s "$d/top.xdl" ] || { echo "$part/$r: not implemented (map.log, par.log)"; continue; }
    [ -f "$W/$part/pd-$r/key.json" ] || PART=$part node gen-pipdrop.mjs "$d/top.xdl" "$W/$part/pd-$r" 20 3 1
    n=$(ls "$W/$part/pd-$r"/*.xdl | wc -l)
    [ "$(ls "$W/$part/pd-$r" | grep '\.bit$' | grep -vc '\.crc\.bit$')" -ge "$n" ] || W="$W" RW=silinx-dcmomux bash fuzz-remote.sh -P 3 "$part/pd-$r"
    [ -s "$W/$part/pd-$r/pips.json" ] || PART=$part node ana-pipdrop.mjs "$W/$part/pd-$r" "$part" > "$W/$part/pd-$r/pips.json"
    PIPS+=("$part:$W/$part/pd-$r/pips.json")
  done
done
for part in xc3s250ecp132-4 xc3s1200efg320-4; do
  files=(); for x in "${PIPS[@]}"; do [ "${x%%:*}" = "$part" ] && files+=("${x#*:}"); done
  [ ${#files[@]} -eq 0 ] || PART=$part node pips-to-db.mjs "${files[@]}" > "$W/$part-features.json" 2> "$W/$part-report.txt"
done
echo "features per device in $W/<part>-features.json (reports in <part>-report.txt)"
