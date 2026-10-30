#!/bin/bash
# Inside the ISE container: the oracle of the device measurements, for every .xdl of a folder.
#   oracle.sh [-P 2] [-r] [-f] dir
# For each <name>.xdl:
#   <name>.x.log    xdl -xdl2ncd (no -force): which tiles, sites, wires and PIPs ISE accepts
#   <name>.xf.log   xdl -xdl2ncd -force, when the first one fails (the design is converted anyway)
#   <name>.drc.log  drc -z of the converted design: antennas and unrouted pins (are the PIPs joined?)
#   -r: also par -p (ISE routes the design, keeping its placement) and xdl -ncd2xdl -> <name>.r.xdl
#   -f: only xdl -xdl2ncd -force (-> <name>.xf.log), for designs known to have DRC errors (the join
#       tests: about 0.09 s per net and run)
# Only these logs and the routed XDL come back; the .ncd files are deleted.
ARGS=("$@"); set --   # settings64.sh reads the positional parameters
source /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1
set -- "${ARGS[@]}"
P=2; ROUTE=0; FORCE=0
while getopts "P:rf" o; do case $o in P) P=$OPTARG;; r) ROUTE=1;; f) FORCE=1;; esac; done
shift $((OPTIND-1))
one() {
  d=$(dirname "$1"); b=$(basename "${1%.xdl}")
  cd "$d" || return
  [ -s "$b.drc.log" ] && return
  t0=$(date +%s)
  if [ "$FORCE" = 1 ] || ! xdl -xdl2ncd "$b.xdl" "$b.ncd" > "$b.x.log" 2>&1; then
    xdl -xdl2ncd -force "$b.xdl" "$b.ncd" > "$b.xf.log" 2>&1 || { echo "FAILED xdl $b"; echo none > "$b.drc.log"; return; }
  fi
  t1=$(date +%s)
  drc -z "$b.ncd" > "$b.drc.log" 2>&1
  echo "xdl2ncd $((t1 - t0)) s, drc $(($(date +%s) - t1)) s" > "$b.time.log"
  if [ "$ROUTE" = 1 ]; then
    par -w -p "$b.ncd" "$b.r.ncd" > "$b.par.log" 2>&1 && xdl -ncd2xdl "$b.r.ncd" "$b.r.xdl" > /dev/null 2>&1
  fi
  rm -f "$b".ncd "$b".r.ncd "$b".drc "$b"*.xwbt "$b".pad "$b"_pad.* "$b".par "$b".unroutes "$b".xpi "$b".ptwx
}
export -f one; export ROUTE FORCE
ls "$1"/*.xdl | grep -v '\.r\.xdl$' | xargs -P "$P" -I{} bash -c 'one {}'
echo DONE
