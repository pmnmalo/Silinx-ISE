#!/bin/bash
# #96: the bidirectional pads (IOBUF: the pad feature IO:<standard>) on the four devices. gen-iobidir.mjs's designs
# (every pad that can drive an output bidirectional, one design per I/O standard), implemented by ISE
# (impl-remote.sh) and compared with the writer, each pad's IO:<standard> the union of its I:<standard> and
# O:<standard> bits (ana-iobidir.mjs: the bits that differ given to the nearest pad) into W/<part>-bidir.json, to
# merge (merge-db.mjs). ISE's outputs stay in W, out of the repository.
#   SILINX_FUZZ_HOST=user@host research/s3e-bitstream/measure-iobidir.sh [W]
set -e
cd "$(dirname "$0")"
export W=${1:-${TMPDIR:-/tmp}/silinx-iobidir}; W=${W%/}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
for part in ${PARTS:-xc3s100ecp132-4 xc3s250ecp132-4 xc3s500efg320-4 xc3s1200efg320-4}; do
  dash=$(echo "$part" | sed -E 's/^(xc3s[0-9]+e)([a-z]+[0-9]+)-/\1-\2-/')
  [ -d "$W/$part/rbd-LVCMOS33" ] || PART=$part node gen-iobidir.mjs "$W/$part" >/dev/null
  todo=(); dirs=()
  for d in "$W/$part"/rbd-*; do x=${d#"$W"/}; dirs+=("$d"); [ -s "$d/top.xdl" ] || todo+=("$x"); done
  [ ${#todo[@]} -eq 0 ] || W="$W" RW=silinx-iobidir-impl PART=$dash bash impl-remote.sh -P 2 "${todo[@]}"
  ok=(); for d in "${dirs[@]}"; do [ -s "$d/top.xdl" ] && ok+=("$d") || echo "${d#"$W"/}: not implemented (map.log, par.log)"; done
  PART=$part node ana-iobidir.mjs --pads "$W/$part-bidir.json" "${ok[@]}" > "$W/$part-bidir.txt" 2>&1 || true
  grep -v '^  ' "$W/$part-bidir.txt"
done
echo "bidirectional pads' features in $W/<part>-bidir.json (reports in <part>-bidir.txt)"
