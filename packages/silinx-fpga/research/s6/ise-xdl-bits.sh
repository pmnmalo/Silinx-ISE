#!/bin/bash
# Inside the ISE container (run with --network none): every <name>.xdl of the folder (or the ones named) through
# xdl -xdl2ncd -force and bitgen -d -g CRC:Disable: <name>.bit, <name>.xlog / <name>.blog (#725 and the later
# bit databases). A design already turned into a .bit is skipped; the .ncd is removed (its size).
#   ise-xdl-bits.sh <dir> [name …]
source /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1
cd "$1" || exit 1; shift
names=("$@"); [ ${#names[@]} -eq 0 ] && for x in *.xdl; do names+=("${x%.xdl}"); done
for b in "${names[@]}"; do
  [ -s "$b.bit" ] && continue
  s=$(date +%s)
  xdl -xdl2ncd -force "$b.xdl" "$b.ncd" > "$b.xlog" 2>&1 || { echo "$b: xdl2ncd FAILED"; continue; }
  bitgen -w -d -g CRC:Disable "$b.ncd" "$b.bit" > "$b.blog" 2>&1 || echo "$b: bitgen FAILED"
  rm -f "$b.ncd" "$b.bgn" "$b.drc" "${b}_bitgen.xwbt"
  echo "$b: $(ls -l "$b.bit" 2>/dev/null | awk '{print $5}') bytes, $(( $(date +%s) - s )) s"
done
