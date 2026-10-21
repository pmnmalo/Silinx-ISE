#!/bin/bash
# #671: the clocks of the I/O registers from every global line: the I/O tiles' GCLKk -> IOIS_CLKj and the
# horizontal clock rows of the I/O columns (GCLKH_PCI_CE_S / _N: GCLKH_GCLKk -> GCLKH_GCLK_UPk / DNk). rd and
# rd2 (gen-iobreg.mjs: IDDR2 / ODDR2 on every pad, so every clock pin of every I/O tile) with their clock buffer
# on each top / bottom BUFGMUX in turn (one global line each), implemented by ISE (impl-remote.sh), every PIP
# removed by codewords (gen-pipdrop.mjs, 20 variants, xdl + bitgen on the ISE machine: fuzz-remote.sh) and
# analysed (ana-pipdrop.mjs); then pips-to-db.mjs gives the features per device. ISE's outputs stay in W, out
# of the repository.
#   SILINX_FUZZ_HOST=user@host research/s3e-bitstream/measure-671.sh [W]
# PARTS (default the XC3S250E-CP132), LINES (default 0-7): the devices and the global lines measured.
set -e
cd "$(dirname "$0")"
export W=${1:-${TMPDIR:-/tmp}/silinx-671}; W=${W%/}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
PARTS=${PARTS:-xc3s250ecp132-4}; LINES=${LINES:-0 1 2 3 4 5 6 7}
# the buffer of each line (the same sites on the four devices)
BUFG=(BUFGMUX_X2Y1 BUFGMUX_X2Y0 BUFGMUX_X1Y1 BUFGMUX_X1Y0 BUFGMUX_X2Y11 BUFGMUX_X2Y10 BUFGMUX_X1Y11 BUFGMUX_X1Y10)
for part in $PARTS; do
  dash=$(echo "$part" | sed -E 's/^(xc3s[0-9]+e)([a-z]+[0-9]+)-/\1-\2-/')
  todo=(); designs=()
  for k in $LINES; do
    [ -d "$W/$part/g$k/rd" ] || PART=$part node gen-iobreg.mjs "$W/$part/g$k" --bufg "${BUFG[$k]}" >/dev/null
    for d in rd rd2; do designs+=("$part/g$k/$d"); [ -s "$W/$part/g$k/$d/top.xdl" ] || todo+=("$part/g$k/$d"); done
  done
  [ ${#todo[@]} -eq 0 ] || W="$W" RW=silinx-671-impl PART=$dash bash impl-remote.sh -P 2 "${todo[@]}"
  files=()
  for x in "${designs[@]}"; do
    d="$W/$x"; pd="$W/${x%/*}/pd-${x##*/}"
    [ -s "$d/top.xdl" ] || { echo "$x: not implemented (map.log, par.log)"; continue; }
    [ -f "$pd/key.json" ] || PART=$part node gen-pipdrop.mjs "$d/top.xdl" "$pd" 20 3 1 >/dev/null
    n=$(ls "$pd"/*.xdl | wc -l)
    [ "$(ls "$pd" | grep '\.bit$' | grep -vc '\.crc\.bit$')" -ge "$n" ] || W="$W" RW=silinx-671 bash fuzz-remote.sh -P 3 "${pd#"$W"/}"
    [ -s "$pd/pips.json" ] || PART=$part node ana-pipdrop.mjs "$pd" "$part" > "$pd/pips.json"
    files+=("$pd/pips.json")
  done
  [ ${#files[@]} -eq 0 ] || PART=$part node pips-to-db.mjs "${files[@]}" > "$W/$part-features.json" 2> "$W/$part-report.txt"
done
echo "features per device in $W/<part>-features.json (reports in <part>-report.txt)"
