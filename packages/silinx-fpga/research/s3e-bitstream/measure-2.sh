#!/bin/bash
# #2: the cascades the bit database lacks, measured on the four devices: the designs of gen-cascade.mjs (SRLC16E
# chains through Q15, MULT18X18SIO chains through BCOUT -> BCIN) implemented by ISE (impl-remote.sh), every PIP of
# each routed design removed by codewords (gen-pipdrop.mjs, xdl + bitgen: fuzz-remote.sh, ana-pipdrop.mjs), and the
# settings the database lacks found in the routed designs (learn-single.mjs). ISE's outputs stay in W.
#   SILINX_FUZZ_HOST=user@host research/s3e-bitstream/measure-2.sh [W]
set -e
cd "$(dirname "$0")"
export W=${1:-${TMPDIR:-/tmp}/silinx-2}; W=${W%/}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
for part in xc3s100ecp132-4 xc3s250ecp132-4 xc3s500efg320-4 xc3s1200efg320-4; do
  dash=$(echo "$part" | sed -E 's/^(xc3s[0-9]+e)([a-z]+[0-9]+)-/\1-\2-/')
  [ -d "$W/$part/srl" ] || PART=$part node gen-cascade.mjs "$W/$part" 8 4 4
  todo=(); for d in srl mult; do [ -s "$W/$part/$d/top.xdl" ] || todo+=("$part/$d"); done
  [ ${#todo[@]} -eq 0 ] || W="$W" RW=silinx-2-impl PART=$dash bash impl-remote.sh -P 2 "${todo[@]}"
  for d in srl mult; do
    [ -s "$W/$part/$d/top.xdl" ] || { echo "$part/$d: not implemented (map.log, par.log)"; continue; }
    [ -f "$W/$part/pd-$d/key.json" ] || PART=$part node gen-pipdrop.mjs "$W/$part/$d/top.xdl" "$W/$part/pd-$d" 20 3 1
    n=$(ls "$W/$part/pd-$d"/*.xdl | wc -l)
    [ "$(ls "$W/$part/pd-$d" | grep '\.bit$' | grep -vc '\.crc\.bit$')" -ge "$n" ] || W="$W" RW=silinx-2 bash fuzz-remote.sh -P 3 "$part/pd-$d"
    [ -s "$W/$part/pd-$d/pips.json" ] || PART=$part node ana-pipdrop.mjs "$W/$part/pd-$d" "$part" > "$W/$part/pd-$d/pips.json"
  done
  PART=$part node learn-single.mjs $(for d in srl mult; do [ -s "$W/$part/$d/top.xdl" ] && echo "$W/$part/$d/top.xdl $W/$part/$d/top.bit"; done) > "$W/$part-learn.json" 2> "$W/$part-learn.txt" || true
done
echo "PIPs in W/<part>/pd-*/pips.json, settings in W/<part>-learn.json"
