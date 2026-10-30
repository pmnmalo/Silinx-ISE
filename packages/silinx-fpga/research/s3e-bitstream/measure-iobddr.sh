#!/bin/bash
# #96: the DDR input registers (IDDR2) on every pad of the four devices: gen-iobreg.mjs's rd / rd2 had ISE's map trim
# the IDDR2s whose outputs went unread. gen-iobddr.mjs's designs (rdi0, rdi1: every pad an IDDR2 in one of them, every
# output read), implemented by ISE (impl-remote.sh), N variants of each at random register settings (gen-iobrand.mjs,
# xdl + bitgen: fuzz-remote.sh), solved against the bit database (ana-iobreg.mjs --known: only the settings it lacks on
# a pad), with rd / rd2's variants (OLD/<part>/v-rd, v-rd2, from measure-iobrot.sh, if there) into W/<part>-pads.json,
# to merge (merge-db.mjs). Two more variants of each design (seed 9) are held out, to check. ISE's outputs stay in W,
# out of the repository. rdi2, rdi3 (one IDDR2 per I/O tile, #751) are implemented and varied but not solved: they
# check what the others give, and show the bits ISE sets only when both pads of a tile have an input register.
#   SILINX_FUZZ_HOST=user@host research/s3e-bitstream/measure-iobddr.sh [W] [N=8] [OLD]
set -e
cd "$(dirname "$0")"
export W=${1:-${TMPDIR:-/tmp}/silinx-iobddr}; W=${W%/}; N=${2:-8}; OLD=${3:-$W/old}
DESIGNS="rdi0 rdi1 rdi2 rdi3"; SOLVE="rdi0 rdi1"
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
for part in ${PARTS:-xc3s100ecp132-4 xc3s250ecp132-4 xc3s500efg320-4 xc3s1200efg320-4}; do
  dash=$(echo "$part" | sed -E 's/^(xc3s[0-9]+e)([a-z]+[0-9]+)-/\1-\2-/')
  [ -d "$W/$part/rdi0" ] || PART=$part node gen-iobddr.mjs "$W/$part" >/dev/null
  todo=(); for d in $DESIGNS; do [ -s "$W/$part/$d/top.xdl" ] || todo+=("$part/$d"); done
  [ ${#todo[@]} -eq 0 ] || W="$W" RW=silinx-iobddr-impl PART=$dash bash impl-remote.sh -P 2 "${todo[@]}"
  dirs=() held=()
  for d in $DESIGNS; do
    [ -s "$W/$part/$d/top.xdl" ] || { echo "$part/$d: not implemented (map.log, par.log)"; continue; }
    [ -f "$W/$part/v-$d/BASE.xdl" ] || node gen-iobrand.mjs "$W/$part/$d/top.xdl" "$W/$part/v-$d" "$N" 1 >/dev/null
    [ -f "$W/$part/h-$d/V01.xdl" ] || { node gen-iobrand.mjs "$W/$part/$d/top.xdl" "$W/$part/h-$d" 2 9 >/dev/null && rm "$W/$part/h-$d/BASE.xdl"; }
    for v in v h; do
      n=$(ls "$W/$part/$v-$d"/*.xdl | wc -l)
      [ "$(ls "$W/$part/$v-$d" | grep '\.bit$' | grep -vc '\.crc\.bit$')" -ge "$n" ] || W="$W" RW=silinx-iobddr bash fuzz-remote.sh -P 3 "$part/$v-$d"
    done
    case " $SOLVE " in *" $d "*) dirs+=("$W/$part/v-$d") ;; esac; held+=("$W/$part/h-$d")
  done
  for d in v-rd v-rd2; do [ -d "$OLD/$part/$d" ] && dirs+=("$OLD/$part/$d"); done
  PART=$part node ana-iobreg.mjs --known --pads "$W/$part-pads.json" "${dirs[@]}" > "$W/$part-report.txt" 2>&1 || true
  echo "$part: $(tail -1 "$W/$part-report.txt")"
done
echo "pads' features in $W/<part>-pads.json (reports in <part>-report.txt; held-out variants in <part>/h-*)"
