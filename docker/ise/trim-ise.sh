#!/bin/bash
# Remove the parts of ISE 14.7 that a command-line FPGA flow (xst ngdbuild map par trce bitgen) does
# not use: EDK, PlanAhead, CORE Generator, SysGen, simulation libraries, docs and GUIs (~18 GB -> ~3 GB).
# Device data of every family is kept unless KEEP_FAMILIES lists the ones to keep.
# Tested: Spartan-3E (XC3S250E/500E), Spartan-6 (XC6SLX9) full flows with bitstreams.
set -u
R=/opt/Xilinx/14.7/ISE_DS
rm -rf "$R/EDK" "$R/PlanAhead"
cd "$R/ISE" || exit 1
rm -rf coregen sysgen secureip smartmodel doc java java6 ISEexamples lib/lin \
       vhdl/hdp vhdl/src verilog/hdp verilog/src \
       data/cse data/zynqconfig data/pcw data/coregen data/linux_flexlm_v11.11.zip data/windows_flexlm_v11.11.zip
# device data: all families are kept by default; KEEP_FAMILIES="spartan3e spartan6 ..." removes the
# others (the families they depend on, e.g. virtex2 for Spartan-3/3E, are always kept).
if [ -n "${KEEP_FAMILIES:-}" ]; then
  keep=" $KEEP_FAMILIES virtex virtex2 virtex2p spartan3 "
  for d in virtex4 virtex5 virtex6 virtex6l virtex7 kintex7 kintex7l artix7 artix7l zynq spartan6 spartan6l spartan3a spartan3adsp spartan3e \
           qvirtex4 qvirtex5 qvirtex6 qvirtex6l qrvirtex4 qrvirtex5 qspartan6 qspartan6l aspartan3a aspartan3adsp aspartan3e aspartan6 \
           akintex7 aartix7 azynq qartix7 qkintex7 qkintex7l qzynq virtex7l; do
    case "$keep" in *" $d "*) ;; *) rm -rf "$d" ;; esac
  done
fi
du -sh "$R" 2>/dev/null
