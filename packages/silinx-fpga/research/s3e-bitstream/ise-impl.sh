#!/bin/bash
# Inside the ISE container: implement HDL designs with ISE (xst, ngdbuild, map, par) for a part
# (PART, default the XC3S250E CP132) and write the routed XDL and the bitstreams (top.bit with
# -g CRC:Disable, top.crc.bit with the CRC), as reference designs for the residual analysis
# (ana-residual.mjs, learn-single.mjs) and check-writer.mjs.
#   [PART=xc3s500e-fg320-4] ise-impl.sh dir…     (each dir: *.vhd and / or *.v, top.ucf; top entity / module "top")
# Run the container with --network none.
ARGS=("$@"); set --
source /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1
P=${PART:-xc3s250e-cp132-4}
for d in "${ARGS[@]}"; do
  (
    cd "$d" || exit 1
    [ -s top.bit ] && exit 0
    : > top.prj
    for f in *.vhd; do [ -f "$f" ] && echo "vhdl work \"$f\"" >> top.prj; done
    for f in *.v; do [ -f "$f" ] && echo "verilog work \"$f\"" >> top.prj; done
    echo "run -ifn top.prj -ifmt mixed -ofn top.ngc -ofmt NGC -p $P -top top -opt_mode Speed -opt_level 1" > top.xst
    mkdir -p xst/tmp; echo "set -tmpdir xst/tmp" | cat - top.xst > top2.xst
    xst -ifn top2.xst -ofn top.syr > xst.log 2>&1 || { echo "$d: xst FAILED"; exit 1; }
    ngdbuild -p $P -uc top.ucf top.ngc top.ngd > ngd.log 2>&1 || { echo "$d: ngdbuild FAILED"; exit 1; }
    map -p $P -o top_map.ncd top.ngd top.pcf > map.log 2>&1 || { echo "$d: map FAILED"; exit 1; }
    par -w top_map.ncd top.ncd top.pcf > par.log 2>&1 || { echo "$d: par FAILED"; exit 1; }
    xdl -ncd2xdl top.ncd top.xdl > n2x.log 2>&1
    bitgen -w -d -g CRC:Disable top.ncd top.bit > bitgen.log 2>&1
    cp top.ncd top.crc.ncd; bitgen -w -d top.crc.ncd top.crc.bit > bitgen-crc.log 2>&1; rm -f top.crc.ncd top.crc.bgn top.crc_bitgen.xwbt
    echo "$d: $([ -s top.bit ] && echo ok || echo FAILED) $(grep -h 'Number of occupied Slices' map.log | head -1 | sed 's/  */ /g')"
  )
done
