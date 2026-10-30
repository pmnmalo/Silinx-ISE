#!/bin/bash
# Inside the ISE container: ISE as the oracle of the Spartan-6 placer (#729) and router (#730).
#   ise-place-check.sh <folder> name...     (for each name: <name>/placed.xdl, and <name>/routed.xdl when there is one)
# placed.xdl: xdl -xdl2ncd (ISE reads the placement and the sites' configuration), then par -k (ISE routes it,
# keeping the placement: the placement is one ISE can complete) and drc of the result.
# routed.xdl: xdl -xdl2ncd and drc (the routing of the Silinx toolchain, every net complete and legal for ISE).
# Remote run (the host only on the command line, never in a file):
#   rsync -a <scratch>/{gates,blinky} "$SILINX_ISE_HOST:<remote dir>/"
#   ssh -o BatchMode=yes "$SILINX_ISE_HOST" 'export PATH="$PATH:/usr/local/bin"; docker run --rm \
#     -v <remote dir>:/w xilinx/ise:14.7 bash /w/ise-place-check.sh /w gates blinky'
source /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1
cd "$1" || exit 1
shift
for b in "$@"; do
  (
    cd "$b" || exit 1
    rm -f placed.ncd par.ncd routed.ncd
    if [ -f placed.xdl ]; then
      xdl -xdl2ncd placed.xdl placed.ncd > xdl2ncd.log 2>&1 || { echo "$b: placed xdl2ncd FAILED"; grep -m5 'ERROR' xdl2ncd.log; exit 1; }
      par -w -k placed.ncd par.ncd > par.log 2>&1 || { echo "$b: par -k FAILED"; grep -m5 'ERROR' par.log; exit 1; }
      drc -z par.ncd > drc-par.log 2>&1
      echo "$b: placed: xdl2ncd ok ($(grep -c WARNING xdl2ncd.log) warnings); par -k: $(grep -h 'All signals are completely routed\|signals are not completely routed' par.log | tail -1 | sed 's/^ *//'); drc: $(grep -h 'PhysDesignRules results\|errors found' drc-par.log | head -1)"
      grep -h 'WARNING' xdl2ncd.log | sort | uniq -c | head -5
    fi
    if [ -f routed.xdl ]; then
      xdl -xdl2ncd routed.xdl routed.ncd > xdl2ncd-routed.log 2>&1 || { echo "$b: routed xdl2ncd FAILED"; grep -m5 'ERROR' xdl2ncd-routed.log; exit 1; }
      drc -z routed.ncd > drc.log 2>&1
      echo "$b: routed: xdl2ncd ok ($(grep -c WARNING xdl2ncd-routed.log) warnings); drc: $(grep -h 'errors found\|PhysDesignRules results' drc.log | head -1)"
      grep -h 'WARNING\|ERROR' drc.log | sort | uniq -c | head -8
    fi
  )
done
