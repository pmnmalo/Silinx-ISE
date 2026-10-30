#!/bin/bash
# Inside the ISE container (run with --network none): the bitstream format of the Spartan-6 (#724, stage
# S6-A). For every <part>.xdl of the folder: xdl -xdl2ncd, then bitgen with the options Silinx writes in
# its .ut for the Spartan-6 (server/ise.js generateUt) and their variants:
#   <part>.<clk>.bit        StartUpClk Cclk / UserClk / JtagClk, the CRC on
#   <part>.nocrc.bit        the same (JtagClk) with -g CRC:Disable
#   <part>.compress.bit     the same (JtagClk) with -g Compress (multi-frame writes: a short FDRI, for the CRC)
#   ise-format.sh <dir>
source /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1
cd "$1" || exit 1
ut() {   # $1 StartUpClk, then more options
  local clk=$1; shift
  printf '%s\n' -w '-g DebugBitstream:No' '-g Binary:no' '-g CRC:Enable' '-g UnusedPin:PullDown' '-g UserID:0xFFFFFFFF' \
    "-g StartUpClk:$clk" '-g DONE_cycle:4' '-g GTS_cycle:5' '-g GWE_cycle:6' '-g Security:None' "$@"
}
for x in *.xdl; do
  b=${x%.xdl}
  [ -s "$b.ncd" ] || xdl -xdl2ncd -force "$x" "$b.ncd" > "$b.xlog" 2>&1 || { echo "$b: xdl2ncd FAILED"; continue; }
  run() {   # $1 the output's name, then the .ut's arguments
    local o=$1; shift
    [ -s "$o.bit" ] && return
    ut "$@" > "$o.ut"
    cp "$b.ncd" "$o.ncd"
    bitgen -f "$o.ut" "$o.ncd" "$o.bit" > "$o.blog" 2>&1 || echo "$o: bitgen FAILED"
    rm -f "$o.ncd"
    echo "$o: $(ls -l "$o.bit" 2>/dev/null | awk '{print $5}') bytes"
  }
  for clk in Cclk UserClk JtagClk; do run "$b.$clk" "$clk"; done
  run "$b.nocrc" JtagClk '-g CRC:Disable'
  run "$b.compress" JtagClk '-g Compress'
done
