#!/bin/bash
# Inside the ISE container (run with --network none): night 1 of the Spartan-6 measurements (#733).
#   ise-s6.sh report <part> <out dir>    xdl -report -pips -all_conns, gzipped; <part>.summary.txt: the
#                                        report's summary line, its tile types and site types counted
#   ise-s6.sh empty <dir>                every <part>.xdl of dir: xdl -xdl2ncd, bitgen with -g CRC:Disable
#                                        (<part>.bit) and with the CRC (<part>.crc.bit)
#   ise-s6.sh impl <part> <dir>…         each dir: HDL (*.vhd, *.v), top.ucf, top.txt (the top): xst, ngdbuild,
#                                        map, par, trce, the map's and par's XDL, bitgen (CRC off and on)
#   ise-s6.sh edif <part> <dir>…         each dir: top.edf (the open synthesis's netlist), top.ucf: ngdbuild,
#                                        map, par, trce, XDL
# Each step's time goes to <dir>/times.txt (seconds), for the plan's estimates.
source /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1
mode=$1; shift
t() { local s=$(date +%s); "$@"; local rc=$?; echo "$STEP $(( $(date +%s) - s ))" >> times.txt; return $rc; }

backend() {   # ngdbuild input -> map, par, trce, XDL; $1 the part, $2 the netlist, $3 more ngdbuild options
  STEP=ngdbuild t ngdbuild -p "$1" $3 -uc top.ucf "$2" top.ngd > ngd.log 2>&1 || { echo "$PWD: ngdbuild FAILED"; return 1; }
  STEP=map t map -w -p "$1" -o top_map.ncd top.ngd top.pcf > map.log 2>&1 || { echo "$PWD: map FAILED"; return 1; }
  STEP=par t par -w top_map.ncd top.ncd top.pcf > par.log 2>&1 || { echo "$PWD: par FAILED"; return 1; }
  STEP=trce t trce -v 10 -u 10 top.ncd top.pcf -o top.twr > trce.log 2>&1
  STEP=xdl t xdl -ncd2xdl top.ncd top.xdl > n2x.log 2>&1
  xdl -ncd2xdl top_map.ncd top_map.xdl >> n2x.log 2>&1
  echo "$PWD: $(grep -h 'Number of occupied Slices' top_map.mrp 2>/dev/null | head -1 | sed 's/  */ /g'); $(grep -h -o 'All signals are completely routed' par.log | head -1)"
}

case "$mode" in
  report)
    part=$1; out=$2; mkdir -p "$out"; cd "$out" || exit 1
    [ -s "$part.xdlrc.gz" ] && { echo "$part: report already there"; exit 0; }
    STEP="report $part" t xdl -report -pips -all_conns "$part" "$part.xdlrc" > "$part.report.log" 2>&1 || { echo "$part: xdl -report FAILED"; exit 1; }
    { grep -m1 '^(summary' "$part.xdlrc" || tail -n 3 "$part.xdlrc" | grep summary
      echo '# tile types'; grep -o '^\s*(tile [0-9]* [0-9]* [A-Za-z0-9_]* [A-Za-z0-9_]*' "$part.xdlrc" | awk '{print $5}' | sort | uniq -c
      echo '# site types'; grep -o '^\s*(primitive_site [A-Za-z0-9_]* [A-Za-z0-9_]*' "$part.xdlrc" | awk '{print $3}' | sort | uniq -c
    } > "$part.summary.txt"
    STEP="gzip $part" t gzip -6 "$part.xdlrc"
    echo "$part: $(ls -l "$part.xdlrc.gz" | awk '{print $5}') bytes gzipped"
    ;;
  empty)
    cd "$1" || exit 1
    for x in *.xdl; do
      [ -f "$x" ] || { echo "$PWD: no .xdl design"; exit 1; }
      b=${x%.xdl}; [ -s "$b.bit" ] && continue
      STEP="xdl2ncd $b" t xdl -xdl2ncd -force "$x" "$b.ncd" > "$b.xlog" 2>&1 || { echo "$b: xdl2ncd FAILED"; continue; }
      STEP="bitgen $b" t bitgen -w -d -g CRC:Disable "$b.ncd" "$b.bit" > "$b.blog" 2>&1 || echo "$b: bitgen FAILED"
      cp "$b.ncd" "$b.crc.ncd"; STEP="bitgen-crc $b" t bitgen -w -d "$b.crc.ncd" "$b.crc.bit" > "$b.crc.blog" 2>&1 || echo "$b: bitgen (CRC) FAILED"
      rm -f "$b.crc.ncd"
      echo "$b: $(ls -l "$b.bit" 2>/dev/null | awk '{print $5}') bytes"
    done
    ;;
  impl|edif)
    part=$1; shift
    for d in "$@"; do
      (
        cd "$d" || exit 1
        [ -s top.twr ] && exit 0
        : > times.txt
        if [ "$mode" = impl ]; then
          top=$(head -n1 top.txt)
          : > top.prj
          for f in *.vhd; do [ -f "$f" ] && echo "vhdl work \"$f\"" >> top.prj; done
          for f in *.v; do [ -f "$f" ] && echo "verilog work \"$f\"" >> top.prj; done
          mkdir -p xst/tmp
          printf 'set -tmpdir xst/tmp\nrun -ifn top.prj -ifmt mixed -ofn top.ngc -ofmt NGC -p %s -top %s -opt_mode Speed -opt_level 1\n' "$part" "$top" > top.xst
          STEP=xst t xst -ifn top.xst -ofn top.syr > xst.log 2>&1 || { echo "$d: xst FAILED"; exit 1; }
          backend "$part" top.ngc || exit 1
          STEP=bitgen t bitgen -w -d -g CRC:Disable top.ncd top.bit > bitgen.log 2>&1
          cp top.ncd top.crc.ncd; bitgen -w -d top.crc.ncd top.crc.bit > bitgen-crc.log 2>&1; rm -f top.crc.ncd
        else
          # (-aul: the open synthesis drops the inputs the design does not use, whose LOC then matches nothing)
          backend "$part" top.edf -aul || exit 1
        fi
      )
    done
    ;;
  *) echo "usage: ise-s6.sh report <part> <dir> | empty <dir> | impl <part> <dir>… | edif <part> <dir>…"; exit 2 ;;
esac
