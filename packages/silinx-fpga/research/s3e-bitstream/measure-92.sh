#!/bin/bash
# #92: the pads' dedicated paths to every DCM's CLKIN, measured on the four devices: the designs of
# gen-dcmpad.mjs (each DCM's CLKIN from one of its clock pads, 4 rounds per device) implemented by ISE
# (impl-remote.sh), every PIP of each routed design removed by codewords (gen-pipdrop.mjs, xdl +
# bitgen on the ISE machine: fuzz-remote.sh) and analysed (ana-pipdrop.mjs); then pips-to-db.mjs gives
# measured/learn-15dcm-pad-pips.json. ISE's outputs stay in W, out of the repository.
#   SILINX_FUZZ_HOST=user@host research/s3e-bitstream/measure-92.sh [W]
set -e
cd "$(dirname "$0")"
export W=${1:-${TMPDIR:-/tmp}/silinx-92}; W=${W%/}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
PIPS=()
for part in xc3s100ecp132-4 xc3s250ecp132-4 xc3s500efg320-4 xc3s1200efg320-4; do
  dash=$(echo "$part" | sed -E 's/^(xc3s[0-9]+e)([a-z]+[0-9]+)-/\1-\2-/')
  [ -d "$W/$part/r0" ] || PART=$part node gen-dcmpad.mjs "$W/$part"
  todo=(); for d in "$W/$part"/r*/; do r=$(basename "$d"); [ -s "$d/top.xdl" ] || todo+=("$part/$r"); done
  [ ${#todo[@]} -eq 0 ] || W="$W" RW=silinx-92-impl PART=$dash bash impl-remote.sh -P 2 "${todo[@]}"
  for d in "$W/$part"/r*/; do
    r=$(basename "$d")
    [ -s "$d/top.xdl" ] || { echo "$part/$r: not implemented (map.log, par.log)"; continue; }
    [ -f "$W/$part/pd-$r/key.json" ] || PART=$part node gen-pipdrop.mjs "$d/top.xdl" "$W/$part/pd-$r" 20 3 1
    n=$(ls "$W/$part/pd-$r"/*.xdl | wc -l)
    [ "$(ls "$W/$part/pd-$r" | grep '\.bit$' | grep -vc '\.crc\.bit$')" -ge "$n" ] || W="$W" RW=silinx-92 bash fuzz-remote.sh -P 3 "$part/pd-$r"
    [ -s "$W/$part/pd-$r/pips.json" ] || PART=$part node ana-pipdrop.mjs "$W/$part/pd-$r" "$part" > "$W/$part/pd-$r/pips.json"
    PIPS+=("$part:$W/$part/pd-$r/pips.json")
  done
done
# per device (pips-to-db.mjs reads the tiles of PART's layout), then merged
for part in xc3s100ecp132-4 xc3s250ecp132-4 xc3s500efg320-4 xc3s1200efg320-4; do
  files=(); for x in "${PIPS[@]}"; do [ "${x%%:*}" = "$part" ] && files+=("${x#*:}"); done
  [ ${#files[@]} -eq 0 ] || PART=$part node pips-to-db.mjs "${files[@]}" > "$W/$part-features.json" 2> "$W/$part-report.txt"
done
echo "features per device in $W/<part>-features.json (reports in <part>-report.txt)"
