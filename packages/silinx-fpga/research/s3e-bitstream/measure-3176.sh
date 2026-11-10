#!/bin/bash
# #3176: the switches of the top-right corner tile (UR) that connect the JTAG's user access primitive (BSCAN_SPARTAN3)
# to the fabric: designs of every BSCAN pin (gen-bscan.mjs, the flip-flops in five regions of the chip) implemented by
# ISE from HDL (impl-remote.sh), every PIP of each routed design removed by codewords (gen-pipdrop.mjs, xdl + bitgen on
# the ISE machine: fuzz-remote.sh), ana-pipdrop.mjs, pips-to-db.mjs. The result, the PIP features of the tile types
# the designs route through, in $W/<part>-features.json (measured/learn-20bscan-pips.json in the repository). ISE's
# outputs stay in W, out of the repository.
#   SILINX_FUZZ_HOST=user@host [RWBASE=/Users/Shared/silinx-ise/build] [PARTS="xc3s250e …"] [ONLY="core …"] research/s3e-bitstream/measure-3176.sh W
# (ONLY: these of gen-bscan.mjs's designs; the measurement made: the six on the XC3S250E, the core on the XC3S100E and the
# XC3S500E too)
# (RWBASE: the folder on the ISE machine for the runs' folders, one Docker Desktop shares, #482; default the home)
set -e
cd "$(dirname "$0")"
export W=${1:?W}; W=${W%/}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
R=${RWBASE:+${RWBASE%/}/}
pkg() { case $1 in xc3s100e|xc3s250e) echo cp132 ;; *) echo fg320 ;; esac; }
for p in ${PARTS:-xc3s250e}; do
  part=$p$(pkg $p)-4
  DESIGNS=$(node gen-bscan.mjs "$W/$p/impl" "$p"); [ -z "$ONLY" ] || DESIGNS=$ONLY
  todo=(); for d in $DESIGNS; do [ -s "$W/$p/impl/$d/top.xdl" ] || todo+=("$p/impl/$d"); done
  [ ${#todo[@]} -eq 0 ] || W="$W" RW=${R}silinx-3176-impl PART=$p-$(pkg $p)-4 bash impl-remote.sh -P 2 "${todo[@]}"
  files=()
  for d in $DESIGNS; do
    [ -s "$W/$p/impl/$d/top.xdl" ] || { echo "$p/$d: not implemented (map.log, par.log)"; exit 1; }
    [ -f "$W/$p/pd-$d/key.json" ] || PART=$part node gen-pipdrop.mjs "$W/$p/impl/$d/top.xdl" "$W/$p/pd-$d" 20 3 1
    n=$(ls "$W/$p/pd-$d"/*.xdl | wc -l)
    [ "$(ls "$W/$p/pd-$d" | grep '\.bit$' | grep -vc '\.crc\.bit$')" -ge "$n" ] || W="$W" RW=${R}silinx-3176 bash fuzz-remote.sh -P 3 "$p/pd-$d"
    [ -s "$W/$p/pd-$d/pips.json" ] || PART=$part node ana-pipdrop.mjs "$W/$p/pd-$d" "$part" > "$W/$p/pd-$d/pips.json"
    files+=("$W/$p/pd-$d/pips.json")
  done
  PART=$part node pips-to-db.mjs "${files[@]}" > "$W/$part-features.json" 2> "$W/$part-report.txt"
  tail -1 "$W/$part-report.txt"
done
echo "features per device in $W/<part>-features.json (reports in <part>-report.txt)"
