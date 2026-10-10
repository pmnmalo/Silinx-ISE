#!/bin/bash
# xdl -> ncd -> bit for every design in a folder, 4 at a time (inside the ISE container)
source /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1
cd "$1"
one() { b="${1%.xdl}"; [ -s "$b.bit" ] && return; xdl -xdl2ncd "$b.xdl" "$b.ncd" > "$b.xlog" 2>&1 && bitgen -w -d -g CRC:Disable "$b.ncd" "$b.bit" > "$b.blog" 2>&1 || echo "FAILED $b"; }
export -f one
ls *.xdl | xargs -P 4 -I{} bash -c 'one {}'
echo DONE
