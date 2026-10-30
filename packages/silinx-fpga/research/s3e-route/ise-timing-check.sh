#!/bin/bash
# Inside the ISE container: trce's timing of a design two ways, for the static timing of the Silinx toolchain
# (#601: the clocks of a DCM, the paths between two clocks, the pads of a DCM's clock).
#   ise-timing-check.sh <folder> name...
# Each <name> folder holds a Silinx project's ISE build (server/ise.js generateBuild: run.sh, <top>.ucf…) and
# silinx.xdl, Silinx's routing of the same design. ISE's own flow (xst, ngdbuild, map, par) gives ise.twr; Silinx's
# routing, converted (xdl -xdl2ncd), is timed against silinx.pcf (the same constraints, dcm-timing.mjs silinxPcf): silinx.twr. Both trce -v 20 -fastpaths -u 20
# (the 20 slowest paths of each constraint and the unconstrained ones, with each path's clock path and skew).
# Remote run: research/s3e-route/dcm-timing.mjs.
source /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1
cd "$1" || exit 1
shift
for b in "$@"; do
  (
    cd "$b" || exit 1
    top=$(sed -n 's/^top=\(.*\)$/\1/p' top.txt)
    grep -q silinxOnly=1 top.txt || bash run.sh synth translate map par > ise-flow.log 2>&1 || { echo "$b: ISE flow FAILED"; tail -5 ise-flow.log; }
    grep -q silinxOnly=1 top.txt || { [ -s "$top.ncd" ] && trce -v 20 -u 20 -fastpaths "$top.ncd" "$top.pcf" -o ise.twr > ise-trce.log 2>&1; }
    rm -f silinx.ncd
    xdl -xdl2ncd silinx.xdl silinx.ncd > xdl2ncd.log 2>&1 || { echo "$b: xdl2ncd FAILED"; tail -5 xdl2ncd.log; exit 1; }
    trce -v 20 -u 20 -fastpaths silinx.ncd silinx.pcf -o silinx.twr > silinx-trce.log 2>&1
    echo "$b: ISE: $(grep -h 'Timing errors' ise.twr 2>/dev/null | head -1); Silinx: $(grep -h 'Timing errors' silinx.twr 2>/dev/null | head -1) $(grep -h 'ERROR' silinx-trce.log | head -2)"
  )
done
