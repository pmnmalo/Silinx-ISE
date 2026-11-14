#!/usr/bin/env node
// The 7-series' timing measured with AMD Vivado (#3516, step 1), as the Spartan-3E's descriptions were measured against
// ISE's trce: the examples (gates … micro80) on the Basys 3 (xc7a35tcpg236-1; the Nexys A7's xc7a100tcsg324-1 with
// --boards), each one's netlist as Silinx's open flow makes it (Yosys's synth_xilinx: the JSON nextpnr reads, written as
// an EDIF by the same Yosys) placed and routed by Vivado on the ISE runner's machine (its Docker image with Vivado ML
// Standard, scripts/vitis-hls-image/: link_design, place_design, route_design, no opt_design: the same netlist), then
// write_sdf (every cell's and routed connection's delay), report_timing (each path's elements), the timing summary (the
// Fmax) and the routes' nodes (measure.tcl); and nextpnr's Fmax on the same netlist (the open flow here, as the
// application runs it). Vivado runs one design after another, alone on the machine.
//
//   node scripts/xc7-timing-vivado.mjs [--boards basys3,nexys-a7] [--filter '^(blinky|pong)$'] [--update]
//     --filter: examples' names separated by | or , ('^…$' whole names, '^' their start, '$' their end, else anywhere)
//   node scripts/xc7-timing-vivado.mjs --detach [--boards …] [--filter …]   Vivado started on the host in the background
//     (it does not depend on this machine staying awake); nextpnr's runs here meanwhile; it prints the run's name
//   node scripts/xc7-timing-vivado.mjs --placement [--detach] [--boards …] [--filter …]   nextpnr's placement routed and
//     timed by Vivado (#3803): each design placed by nextpnr here (as the open flow runs it, --write), its cells' sites and
//     BELs fixed in Vivado (measure.tcl after link_design: placement.txt, written as placement.xdc), route_design (a
//     place_design before it places only what nextpnr's placement did not give: the IO buffers at their pins, a carry
//     chain nextpnr moved, a LUTRAM's parts); with --update its numbers go to each design's nextpnrPlacement, its own
//     measurement (Vivado's placement, the fit) kept. A run's mode is kept for --collect.
//   node scripts/xc7-timing-vivado.mjs --collect <run> [--update]   its results once it is done (else its progress); the
//     run's folder on the host deleted only once --update has saved them
//     --update: the numbers written to packages/silinx-fpga/research/xc7/vivado-timing.json (per board and example:
//     Vivado's and nextpnr's Fmax, the cells' delays, the routes' delays by wire class), then fitted
//     (scripts/xc7-timing-fit.mjs: …/xc7/timing-fit.json)
//   SILINX_ISE_HOST=user@host (else ~/.silinx/config.json's ssh user and host, read here, never written in a file),
//   SILINX_ISE_HOST=local: the image on this machine; SILINX_VIVADO_IMAGE (default xilinx/vitis-hls:2025.2: Vivado ML
//   Standard 2025.2 with Vitis HLS); SILINX_VIVADO_TIMEOUT (a design's, s, default 3600); SILINX_ISE_REMOTE_DIR as
//   scripts/check-open-flow.mjs.
// Vivado's own files (its SDF, reports, logs, the routes) stay in a temporary folder on the host and here, deleted after
// the run: only numbers are written (#3516, never commit Xilinx files).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSdf, parseTimingPaths, parseRoutes, connections, nextpnrPathSplit } from './xc7-timing-parse.mjs';
import { cellSamples, cellStats, wireSamples, groupWires, fitMeasurement, MEASURED, FITTED } from './xc7-timing-fit.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BOARDS = { basys3: 'xc7a35tcpg236-1', 'nexys-a7': 'xc7a100tcsg324-1' };
const SETTINGS = ['/tools/Xilinx/*/Vivado/settings64.sh', '/tools/Xilinx/Vivado/*/settings64.sh', '/opt/Xilinx/*/Vivado/settings64.sh', '/opt/Xilinx/Vivado/*/settings64.sh'];
/** The files measure.tcl writes in a design's folder, moved to its results. */
export const OUTPUTS = ['route.rpt', 'summary.rpt', 'paths.rpt', 'design.sdf', 'routes.txt', 'placement.rpt', 'placement.xdc'];

/** Yosys's commands that write Silinx's netlist (netlist.json, the open flow's) as the EDIF Vivado reads (netlist.edf):
 *  the Xilinx cells' library read first (their ports' directions), unused library cells and scope cells left out. */
export function edifScript(top) {
  if (!/^[A-Za-z_][\w$]*$/.test(top)) throw new Error(`invalid top module name '${top}'`);
  return `read_verilog -lib -specify +/xilinx/cells_sim.v; read_verilog -lib +/xilinx/cells_xtra.v; read_json netlist.json; hierarchy -top ${top} -purge_lib; select -clear; delete t:$scopeinfo; write_edif -pvector bra netlist.edf`;
}

/** nextpnr's placement of a design (#3803) as placementTcl reads it (placement.txt): a line per cell of Vivado's netlist
 *  that nextpnr placed, "<cell>\t<grid x>\t<grid y>\t<site prefix>\t<site x in the tile>\t<site y>\t<BEL>" (NEXTPNR_BEL
 *  X10Y143/SLICE_X1Y0.C6LUT: the tile at the grid point (10, 143), Vivado's GRID_POINT_X and _Y, its second SLICE, the
 *  BEL C6LUT). routed: nextpnr's --write JSON (text or object); cells: the names of Vivado's netlist's cells (the
 *  synthesis's top module's). A cell keeps its name in nextpnr but for a carry chain's CARRY4 that nextpnr packed again
 *  (<name>$split$muxcy<k>$PACKED_CARRY4$): Vivado's CARRY4 where k is 0 (the chain where it was), else left to Vivado
 *  (a chain moved by a MUXCY). Left out, and counted by type in `left`: the cells nextpnr made (feed-through LUTs, a
 *  LUTRAM's parts, the constants' drivers), the IO buffers (their pins fixed by netlist.xdc) and a moved CARRY4.
 *  -> { lines: [{ cell, x, y, prefix, sx, sy, bel }], text, left: { type: n } } */
export function placementLines(routed, cells) {
  const json = typeof routed === 'string' ? JSON.parse(routed) : routed;
  const top = Object.values(json.modules || {}).find((m) => m.attributes?.top) || Object.values(json.modules || {})[0] || { cells: {} };
  const names = new Set(cells), lines = [], left = {};
  for (const [name, c] of Object.entries(top.cells || {})) {
    const m = /^X(\d+)Y(\d+)\/([A-Z0-9]+(?:_[A-Z0-9]+)*?)_X(\d+)Y(\d+)\.(?:.*\.)?([A-Za-z0-9_]+)$/.exec(c.attributes?.NEXTPNR_BEL || '');
    const carry = /^(.*)\$split\$muxcy(\d+)\$PACKED_CARRY4\$$/.exec(name);
    const cell = names.has(name) ? name : carry && carry[2] === '0' && names.has(carry[1]) ? carry[1] : null;
    if (!m || !cell || /^IOB33|^PAD$|^PSEUDO_/.test(c.type)) { left[c.type] = (left[c.type] || 0) + 1; continue; }
    lines.push({ cell, x: +m[1], y: +m[2], prefix: m[3], sx: +m[4], sy: +m[5], bel: m[6] });
  }
  lines.sort((a, b) => (a.cell < b.cell ? -1 : a.cell > b.cell ? 1 : 0));
  for (const l of lines) if (/[\t\n]/.test(l.cell)) throw new Error(`a cell's name with a tab or a newline: ${JSON.stringify(l.cell)}`);
  const text = lines.map((l) => `${l.cell}\t${l.x}\t${l.y}\t${l.prefix}\t${l.sx}\t${l.sy}\t${l.bel}\n`).join('');
  return { lines, text, left };
}

/** The part of measure.tcl that fixes nextpnr's placement (#3803, placement.txt: placementLines'), after link_design:
 *  each cell's site found from its tile's grid point (the sites of the tile with its prefix, the lowest X and Y plus its
 *  offset, as nextpnr's chip database names them relative to the tile), placed there (place_cell) with IS_LOC_FIXED and
 *  IS_BEL_FIXED, and written as the same constraints in placement.xdc (to read before link_design in another run);
 *  placement.rpt: a line per cell not placed (MISSING: not in Vivado's netlist, NOSITE, FAILED: place_cell's error), then
 *  the counts. place_design after it places only what nextpnr's placement did not give (the IO buffers at their pins,
 *  a moved carry chain, the LUTRAMs) and moves no fixed cell; route_design routes nextpnr's placement. */
const PLACEMENT_TCL = `# nextpnr's placement (#3803): placement.txt's cells fixed where nextpnr put them
set tiles [dict create]
foreach t [get_tiles] { dict set tiles "[get_property GRID_POINT_X $t],[get_property GRID_POINT_Y $t]" $t }
proc siteOf {tiles gx gy prefix sx sy} {
  if {![dict exists $tiles "$gx,$gy"]} { return "" }
  set xs {}; set ys {}
  foreach s [get_sites -quiet -of_objects [dict get $tiles "$gx,$gy"]] {
    if {[regexp "^\${prefix}_X(\\\\d+)Y(\\\\d+)\\$" [get_property NAME $s] - x y]} { lappend xs $x; lappend ys $y }
  }
  if {[llength $xs] == 0} { return "" }
  return "\${prefix}_X[expr {[tcl::mathfunc::min {*}$xs] + $sx}]Y[expr {[tcl::mathfunc::min {*}$ys] + $sy}]"
}
set cells [dict create]
foreach c [get_cells -quiet -hierarchical -filter {IS_PRIMITIVE}] { dict set cells [get_property NAME $c] $c }
set fixed 0; set missing 0; set nosite 0; set failed 0
set in [open placement.txt r]; set xdc [open placement.xdc w]; set rpt [open placement.rpt w]
while {[gets $in line] >= 0} {
  lassign [split $line "\\t"] name gx gy prefix sx sy bel
  if {![dict exists $cells $name]} { incr missing; puts $rpt "MISSING\\t$name"; continue }
  set site [siteOf $tiles $gx $gy $prefix $sx $sy]
  if {$site eq ""} { incr nosite; puts $rpt "NOSITE\\t$name\\tX\${gx}Y\${gy} \${prefix}_X\${sx}Y\${sy}"; continue }
  set c [dict get $cells $name]
  if {[catch {place_cell $c $site/$bel} err]} { incr failed; puts $rpt "FAILED\\t$name\\t$site/$bel\\t[string map {"\\n" " "} $err]"; continue }
  set_property IS_BEL_FIXED 1 $c
  set_property IS_LOC_FIXED 1 $c
  incr fixed
  set q "get_cells -hierarchical -filter {NAME == \\"$name\\"}"
  puts $xdc "set_property BEL $bel \\[$q\\]\\nset_property LOC $site \\[$q\\]"
}
close $in; close $xdc
puts $rpt "FIXED\\t$fixed\\nMISSING\\t$missing\\nNOSITE\\t$nosite\\nFAILED\\t$failed"
puts $rpt "UNPLACED\\t[llength [get_cells -quiet -hierarchical -filter {IS_PRIMITIVE && PRIMITIVE_LEVEL != INTERNAL && LOC == ""}]]"
close $rpt
`;

/** placement.rpt's counts (PLACEMENT_TCL's): { fixed, missing, nosite, failed, unplaced } (the cells left to place_design:
 *  unplaced), or null with none. */
export function placementCounts(text) {
  const n = (k) => { const m = new RegExp(`^${k}\\t(\\d+)$`, 'm').exec(text); return m ? +m[1] : null; };
  const c = { fixed: n('FIXED'), missing: n('MISSING'), nosite: n('NOSITE'), failed: n('FAILED'), unplaced: n('UNPLACED') };
  return c.fixed === null ? null : c;
}

/** measure.tcl: a design's netlist (netlist.edf, its constraints netlist.xdc) placed and routed by Vivado, and its timing
 *  written: route.rpt, summary.rpt (the Fmax), paths.rpt (the worst paths, each element), design.sdf (slow corner), and
 *  routes.txt (each routed net's driver, sinks and PIPs by their nodes; each LUT input's bel pin: parseRoutes's). */
export function measureTcl({ paths = 100, placement = false } = {}) {
  return `# Generated by Silinx (#3516, scripts/xc7-timing-vivado.mjs): Silinx's netlist placed and routed by Vivado, its timing written.
#   vivado -mode batch -source measure.tcl -tclargs <design folder> <top> <part>
lassign $argv dir top part
cd $dir
set_param general.maxThreads 2
# with -top, link_design looks for an EDIF named after the top module (#3738)
file copy -force netlist.edf $top.edf
read_edif $top.edf
read_xdc netlist.xdc
link_design -top $top -part $part
${placement ? PLACEMENT_TCL : ''}place_design
route_design
report_route_status -file route.rpt
report_timing_summary -max_paths 1 -report_unconstrained -file summary.rpt
report_timing -delay_type max -max_paths ${Number(paths)} -nworst 1 -unique_pins -input_pins -sort_by slack -file paths.rpt
write_sdf -force -process_corner slow -mode timesim design.sdf
# a cell pin's node: its site pin's (none inside a site)
proc nodeOf {pin} {
  set sp [get_site_pins -quiet -of_objects $pin]
  if {[llength $sp] == 0} { return "" }
  return [lindex [get_nodes -quiet -of_objects [lindex $sp 0]] 0]
}
set f [open routes.txt w]
foreach net [get_nets -quiet -hierarchical -filter {ROUTE_STATUS == ROUTED}] {
  puts $f "NET\\t$net"
  foreach p [get_pins -quiet -leaf -of_objects $net -filter {DIRECTION == OUT}] { puts $f "DRV\\t$p\\t[nodeOf $p]" }
  foreach p [get_pins -quiet -leaf -of_objects $net -filter {DIRECTION == IN}] { puts $f "SNK\\t$p\\t[nodeOf $p]" }
  foreach pip [get_pips -quiet -of_objects $net] {
    puts $f "PIP\\t[lindex [get_nodes -quiet -uphill -of_objects $pip] 0]\\t[lindex [get_nodes -quiet -downhill -of_objects $pip] 0]"
  }
}
foreach c [get_cells -quiet -hierarchical -filter {REF_NAME =~ LUT*}] {
  foreach p [get_pins -quiet -of_objects $c -filter {DIRECTION == IN}] { puts $f "LUTPIN\\t$p\\t[get_bel_pins -quiet -of_objects $p]" }
}
close $f
puts "=== SILINX DONE ==="
`;
}

/** run.sh: in the Vivado image, each design of <work>/designs.txt ("<id> <top> <part>" a line) through measure.tcl, one
 *  after another; its exit code in results/<id>/status.txt, measure.tcl's files moved to results/<id>/; at the end,
 *  <work>/done (for --collect). */
export function runSh() {
  return `#!/bin/bash
# Generated by Silinx (#3516, scripts/xc7-timing-vivado.mjs).   bash run.sh <work folder>
set -u
W=\${1:?usage: run.sh <work folder>}
T=\${SILINX_VIVADO_TIMEOUT:-3600}
S=\${VIVADO_SETTINGS:-$(ls -d ${SETTINGS.join(' ')} 2>/dev/null | head -1)}
[ -n "$S" ] || { echo "no Vivado settings64.sh found (set VIVADO_SETTINGS)"; exit 2; }
# shellcheck disable=SC1090
. "$S" >/dev/null
[ -n "\${HOME:-}" ] && [ -w "$HOME" ] || export HOME=/tmp
while read -r id top part; do
  [ -n "$id" ] || continue
  D="$W/designs/$id"; R="$W/results/$id"
  mkdir -p "$R"
  ( cd "$D" && timeout "$T" vivado -mode batch -nojournal -notrace -log "$R/vivado.log" -source "$W/measure.tcl" -tclargs "$D" "$top" "$part" >/dev/null 2>&1 ); echo "vivado $?" >"$R/status.txt"
  for f in ${OUTPUTS.join(' ')}; do [ -f "$D/$f" ] && mv "$D/$f" "$R/"; done
  rm -rf "$D/.Xil"
  echo "$id: $(cat "$R/status.txt")"
done <"$W/designs.txt"
touch "$W/done"
`;
}

/** --filter's test of an example's name (#3752: no regular expression built from the command line): names separated by
 *  | or , ('blinky|pong', 'blinky,pong'), in parentheses or not, a name matched whole between ^ and $ ('^(blinky|pong)$'),
 *  at the name's start after ^ alone, at its end before $ alone, anywhere with neither; anything else an error. */
export function nameFilter(filter) {
  const m = /^(\^?)(\(?)(\w+(?:[|,]\w+)*)(\)?)(\$?)$/.exec(filter);
  if (!m || !m[2] !== !m[4]) throw new Error(`--filter: examples' names separated by | or , (as '^(blinky|pong)$'), not ${filter}`);
  const names = m[3].split(/[|,]/);
  const start = m[1] === '^', end = m[5] === '$';
  return (n) => names.some((x) => (start && end ? n === x : start ? n.startsWith(x) : end ? n.endsWith(x) : n.includes(x)));
}

/** The designs of a run: [{ id: '<board>-<example>', board, name, part }] of the boards (BOARDS' names) and the examples
 *  whose name matches filter (nameFilter's; all with none). */
export function selectDesigns(examples, boards, filter) {
  const keep = filter ? nameFilter(filter) : () => true;
  for (const b of boards) if (!BOARDS[b]) throw new Error(`--boards: no 7-series board ${b} (${Object.keys(BOARDS).join(', ')})`);
  return boards.flatMap((board) => examples.filter(keep).map((name) => ({ id: `${board}-${name}`, board, name, part: BOARDS[board] })));
}

/** A design's results (its folder: status.txt and measure.tcl's files) as numbers: { status, vivado: { fmaxMHz,
 *  minPeriodNs, wnsNs, logicNs, routeNs, levels }, cells, wires, placement? } (cells: the cells' statistics; wires: the
 *  routes' groups; placement: on nextpnr's placement, placementCounts'), or { status, error } when Vivado failed. read(file) -> its text or ''. */
export function designNumbers(read, parseSummary) {
  const status = /vivado (\d+)/.exec(read('status.txt'))?.[1] ?? null;
  if (status !== '0') return { status, error: `Vivado ${status === null ? 'did not run' : `exited with ${status}`}` };
  const sum = parseSummary(read('summary.rpt'));
  const worst = parseTimingPaths(read('paths.rpt'))[0] || null;
  const sdf = parseSdf(read('design.sdf'));
  const routes = parseRoutes(read('routes.txt'));
  const conns = routes.nets.flatMap(connections);
  const placement = placementCounts(read('placement.rpt'));
  return {
    status,
    vivado: { fmaxMHz: sum.maxFreqMHz, minPeriodNs: sum.minPeriodNs, wnsNs: sum.wnsNs, logicNs: worst?.logicNs ?? null, routeNs: worst?.routeNs ?? null, levels: worst?.levels ?? null },
    cells: cellStats(cellSamples(sdf, routes.lutPins)),
    wires: groupWires(wireSamples(sdf, conns)),
    ...(placement && { placement }),
  };
}

/** The jobs among the host's containers (docker ps --format '{{.Image}}\t{{.Names}}', a line each): those of a Xilinx
 *  image (xilinx/ise, xilinx/vitis-hls, or image) or named silinx-* (the detached runs'); the host's own services (its
 *  proxy, tailscale) are not jobs. -> their names. */
export function jobContainers(text, image = '') {
  return String(text).split(/\r?\n/).map((l) => l.trim().split('\t')).filter(([img]) => img)
    .filter(([img, name = '']) => /^(docker\.io\/)?xilinx\/(ise|vitis-hls)(:|$)/.test(img) || (image && img === image) || /^silinx-/.test(name))
    .map(([img, name]) => name || img);
}

/** Whether --collect keeps a run's folder on the host: until --update has saved its results. */
export const keepsRun = (args) => !args.includes('--update');

/** The measurement file's content with a run's designs ({ id: { board, name, vivado, nextpnr, cells, wires } }) put in
 *  (each board's examples sorted; a design measured again replaced). With placement (--placement, #3803), Vivado's run on
 *  nextpnr's placement: only the design's nextpnrPlacement { vivado, nextpnr, sameNetlist, placement } replaced, its own
 *  measurement (Vivado's placement, the fit's numbers) kept; a design measured again keeps its nextpnrPlacement. */
export function mergeMeasurement(old, designs, { image, placement = false }) {
  const examples = structuredClone(old?.examples || {});
  for (const d of Object.values(designs)) {
    if (d.error) continue;
    const was = (examples[d.board] ||= {})[d.name] || {};
    examples[d.board][d.name] = placement
      ? { ...was, nextpnrPlacement: { vivado: d.vivado, nextpnr: d.nextpnr ?? null, sameNetlist: d.sameNetlist ?? null, placement: d.placement ?? null } }
      : { vivado: d.vivado, nextpnr: d.nextpnr ?? null, sameNetlist: d.sameNetlist ?? null, cells: d.cells, wires: d.wires, ...(was.nextpnrPlacement && { nextpnrPlacement: was.nextpnrPlacement }) };
  }
  const sorted = Object.fromEntries(Object.keys(examples).sort().map((b) => [b, Object.fromEntries(Object.keys(examples[b]).sort().map((n) => [n, examples[b][n]]))]));
  return { issue: 3516, vivado: '2025.2', image, units: { delays: 'ps', fmax: 'MHz', paths: 'ns' }, examples: sorted };
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);

// a design through Silinx's open flow (exampleProject, runOpenImplementation): steps; -> { dir, top, project, reports }
async function openFlow(d, into, steps) {
  const { exampleProject } = await import('../test/examples-lib.mjs');
  const { runOpenImplementation } = await import('../server/open-flow.js');
  fs.mkdirSync(into, { recursive: true });
  const { dir, project } = exampleProject(d.name, { board: d.board }, into);
  const lines = [];
  const job = { log: (l) => lines.push(l), result: null, cancelled: false, procs: new Set() };
  const r = await runOpenImplementation(job, { project, projectDir: dir, steps });
  const netlist = fs.readFileSync(path.join(dir, r.reports.files.netlist), 'utf8');
  const top = Object.entries(JSON.parse(netlist).modules).find(([, m]) => m.attributes?.top)?.[0] || project.top;
  return { dir, project, top, netlist, reports: r.reports, warnings: lines.filter((l) => /WARNING|ERROR/.test(l)) };
}

/** nextpnr's placement of a design's netlist (f: openFlow's) as placement.txt in folder D (#3803): nextpnr run as the open
 *  flow runs it (xc7ParArgs, the server's router, seed 1: the placement nextpnrNumbers times), its design written
 *  (--write). -> { cells: placed, left: placementLines' } */
async function writePlacement(d, f, D) {
  const { nextpnrXc7Node } = await import('../packages/silinx-fpga/src/node.js');
  const { xc7ParArgs, nextpnrXdc, portBits } = await import('../packages/silinx-fpga/src/index.js');
  const { readXdc } = await import('../packages/silinx-fpga/src/parts.js');
  const np = nextpnrXc7Node();
  const xdc = nextpnrXdc(readXdc(fs.readFileSync(path.join(f.dir, f.project.constraints), 'utf8')), portBits(f.netlist, f.top));
  const args = [...xc7ParArgs({ part: d.part, router: np.router, seed: 1, xdc: !!xdc.text }), '--write', 'routed.json'];
  const out = await np.run(args, { 'chipdb.bin': await np.chipdb(d.part, () => {}), 'netlist.json': f.netlist, ...(xdc.text && { 'design.xdc': xdc.text }) });
  const cells = Object.keys((Object.values(JSON.parse(f.netlist).modules).find((m) => m.attributes?.top) || { cells: {} }).cells);
  const p = placementLines(new TextDecoder().decode(out['routed.json']), cells);
  fs.writeFileSync(path.join(D, 'placement.txt'), p.text);
  return { cells: p.lines.length, left: p.left };
}

/** What Vivado reads of a design ({ board, name }), written in folder D: its netlist (the open flow's synthesis, the
 *  projects made in into) as netlist.edf, its constraints as netlist.xdc; with placement, nextpnr's placement
 *  (placement.txt). -> { top, netlist: the JSON's hash, placed? } */
async function prepareDesign(d, into, D, { placement = false } = {}) {
  const { yosysNode } = await import('../packages/silinx-fpga/src/node.js');
  const f = await openFlow(d, into, ['synth', 'translate']);
  const out = await yosysNode(['-q', '-p', edifScript(f.top)], { 'netlist.json': f.netlist });
  fs.mkdirSync(D, { recursive: true });
  fs.writeFileSync(path.join(D, 'netlist.edf'), out['netlist.edf']);
  fs.copyFileSync(path.join(f.dir, f.project.constraints), path.join(D, 'netlist.xdc'));
  const placed = placement ? await writePlacement(d, f, D) : null;
  fs.rmSync(f.dir, { recursive: true, force: true });
  return { top: f.top, netlist: sha(f.netlist), ...(placed && { placed }) };
}

/** nextpnr's numbers of a design (the whole open flow, as the application runs it): { netlist: its netlist's hash (the
 *  one Vivado had?), fmaxMHz, logicNs, routeNs (its critical path's) }. */
async function nextpnrNumbers(d, into) {
  const f = await openFlow(d, into, ['synth', 'translate', 'par', 'trce']);
  const report = JSON.parse(fs.readFileSync(path.join(f.dir, 'build', 'open', 'nextpnr-report.json'), 'utf8'));
  const split = Object.values(nextpnrPathSplit(report)).sort((a, b) => b.totalNs - a.totalNs)[0] || {};
  fs.rmSync(f.dir, { recursive: true, force: true });
  return { netlist: sha(f.netlist), fmaxMHz: f.reports.timing?.maxFreqMHz ?? null, logicNs: split.logicNs ?? null, routeNs: split.routeNs ?? null };
}

async function main() {
  const { iseWorkBase, configPath } = await import('../server/toolchain.js');
  const { DOCKER_ISOLATION } = await import('../server/ise.js');
  const { VIVADO_DOCKER_ARGS } = await import('../server/vivado.js');
  const { parseTimingSummary } = await import('../server/vivado-reports.js');
  const { EXAMPLES } = await import('../test/examples-lib.mjs');
  const a = process.argv.slice(2);
  const opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
  const IMAGE = process.env.SILINX_VIVADO_IMAGE || 'xilinx/vitis-hls:2025.2';
  let HOST = process.env.SILINX_ISE_HOST;
  if (!HOST) try { const s = JSON.parse(fs.readFileSync(configPath(), 'utf8')).ssh; if (s?.host) HOST = s.user ? `${s.user}@${s.host}` : s.host; } catch { /* no config */ }
  if (!HOST) { console.error('set SILINX_ISE_HOST=user@host (the machine with the Vivado image, reached by ssh with a key), or SILINX_ISE_HOST=local'); process.exit(2); }
  const collect = opt('--collect');
  if (collect && !/^silinx-xc7t-[\w]+$/.test(collect)) { console.error(`--collect: not a run's name: ${collect}`); process.exit(2); }
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 256 << 20 });
  const SSH = ['-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=4', '-o', 'ConnectTimeout=30'];
  const ssh = (cmd) => run('ssh', [...SSH, '--', HOST, `export PATH="$PATH:/usr/local/bin"; ${cmd}`]);
  const rsync = (...args) => run('rsync', ['-a', '-e', `ssh ${SSH.join(' ')}`, ...args]);
  const remoteOf = (name) => `${iseWorkBase('silinx-xc7t')}/${name}`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7t-'));
  const name = collect || path.basename(work);
  const local = HOST === 'local';
  const docker = ['run', '--rm', ...DOCKER_ISOLATION, ...VIVADO_DOCKER_ARGS, '--platform', 'linux/amd64', '-e', `SILINX_VIVADO_TIMEOUT=${Number(process.env.SILINX_VIVADO_TIMEOUT) || 3600}`];
  const projects = path.join(work, 'projects');
  try {
    let designs, meta;
    if (collect) {
      // a detached run: its progress, or its results once its last design is done
      const remote = remoteOf(collect);
      const state = ssh(`cd ${remote} && wc -l < designs.txt && (ls results 2>/dev/null | wc -l) && (ls done 2>/dev/null || docker ps -q -f name=${collect} | sed 's/.*/running/')`).trim().split(/\s+/);
      if (state[2] !== 'done') {
        console.log(`${collect}: ${state[1]} of ${state[0]} designs started, ${state[2] === 'running' ? 'still running' : 'STOPPED before its end (its container is gone): run it again'}`);
        process.exitCode = 3;
        return;
      }
      rsync(`${HOST}:${remote}/silinx.json`, `${HOST}:${remote}/results`, `${work}/`);
      try { rsync(`${HOST}:${remote}/nextpnr.json`, `${work}/`); } catch { /* nextpnr's numbers not uploaded: made again here */ }
      meta = JSON.parse(fs.readFileSync(path.join(work, 'silinx.json'), 'utf8'));
      designs = meta.designs;
    } else {
      designs = selectDesigns(EXAMPLES, (opt('--boards') || 'basys3').split(','), opt('--filter'));
      if (!designs.length) { console.error('no design selected (--boards, --filter)'); process.exit(2); }
      const busy = local ? [] : jobContainers(ssh("docker ps --format '{{.Image}}\t{{.Names}}'"), IMAGE);
      if (busy.length) { console.error(`another job is running on the host (${busy.join(', ')}): Vivado runs alone there, wait for it`); process.exit(4); }
      // each design's netlist (the open flow's synthesis) as an EDIF, its constraints, in the work folder
      // (--placement: nextpnr's placement too, fixed in Vivado, #3803)
      const placement = a.includes('--placement'), list = [];
      for (const d of designs) {
        Object.assign(d, await prepareDesign(d, projects, path.join(work, 'designs', d.id), { placement }));
        list.push(`${d.id} ${d.top} ${d.part}`);
        console.log(`${d.id}: netlist of <${d.top}> written for Vivado${d.placed ? `, nextpnr's placement of ${d.placed.cells} cells (left to Vivado: ${Object.entries(d.placed.left).map(([t, n]) => `${n} ${t}`).join(', ') || 'none'})` : ''}`);
      }
      meta = { image: IMAGE, placement, designs: Object.fromEntries(designs.map((d) => [d.id, d])) };
      fs.writeFileSync(path.join(work, 'designs.txt'), `${list.join('\n')}\n`);
      fs.writeFileSync(path.join(work, 'silinx.json'), JSON.stringify(meta, null, 2));
      fs.writeFileSync(path.join(work, 'measure.tcl'), measureTcl({ placement }));
      fs.writeFileSync(path.join(work, 'run.sh'), runSh());
      fs.rmSync(projects, { recursive: true, force: true });
      if (local) run('docker', [...docker, '-v', `${work}:/w`, IMAGE, 'bash', '/w/run.sh', '/w']);
      else {
        const remote = remoteOf(name), mount = remote.startsWith('/') ? remote : `$HOME/${remote}`;
        ssh(`rm -rf ${remote} && mkdir -p ${remote}`);
        rsync(`${work}/`, `${HOST}:${remote}/`);
        if (a.includes('--detach')) {
          // (the container named as the run: --collect finds it)
          ssh(`docker run -d --name ${name} ${docker.slice(1).join(' ')} -v "${mount}":/w ${IMAGE} bash /w/run.sh /w`);
          console.log(`${name}: ${designs.length} designs started on the host; nextpnr's runs here meanwhile`);
        } else {
          try {
            process.stdout.write(ssh(`docker run ${docker.slice(1).join(' ')} -v "${mount}":/w ${IMAGE} bash /w/run.sh /w`));
            rsync(`${HOST}:${remote}/results/`, `${work}/results/`);
          } finally { ssh(`rm -rf ${remote}`); }
        }
      }
    }
    // nextpnr's numbers on the same netlists (here; with --detach while Vivado runs, uploaded to the run's folder)
    const npFile = path.join(work, 'nextpnr.json');
    const nextpnr = fs.existsSync(npFile) ? JSON.parse(fs.readFileSync(npFile, 'utf8')) : {};
    for (const d of Object.values(meta.designs)) {
      if (nextpnr[d.id]) continue;
      nextpnr[d.id] = await nextpnrNumbers(d, projects);
      fs.writeFileSync(npFile, JSON.stringify(nextpnr, null, 2));
      console.log(`${d.id}: nextpnr ${nextpnr[d.id].fmaxMHz ?? '-'} MHz${nextpnr[d.id].netlist === d.netlist ? '' : ' (NOT the netlist Vivado had)'}`);
    }
    if (!collect && a.includes('--detach') && !local) {
      rsync(npFile, `${HOST}:${remoteOf(name)}/`);
      console.log(`collect with: node scripts/xc7-timing-vivado.mjs --collect ${name} --update`);
      return;
    }

    // Vivado's numbers against nextpnr's
    const results = {};
    for (const d of Object.values(meta.designs)) {
      const R = path.join(work, 'results', d.id);
      const read = (f) => (fs.existsSync(path.join(R, f)) ? fs.readFileSync(path.join(R, f), 'utf8') : '');
      results[d.id] = { ...d, ...designNumbers(read, parseTimingSummary), nextpnr: nextpnr[d.id], sameNetlist: nextpnr[d.id]?.netlist === d.netlist };
      const r = results[d.id];
      const p = r.placement;
      console.log(`${d.id.padEnd(22)} ${r.error ? r.error : `Vivado ${r.vivado.fmaxMHz ?? '-'} MHz${meta.placement ? ' on nextpnr\'s placement' : ''}, nextpnr ${r.nextpnr?.fmaxMHz ?? '-'} MHz, ${r.wires.reduce((s, g) => s + g.n, 0)} connections${p ? `; ${p.fixed} cells fixed, ${p.missing + p.nosite + p.failed} not (MISSING ${p.missing}, NOSITE ${p.nosite}, FAILED ${p.failed}: placement.rpt), ${p.unplaced} left to place_design` : ''}`}`);
    }
    if (a.includes('--update')) {
      const old = fs.existsSync(MEASURED) ? JSON.parse(fs.readFileSync(MEASURED, 'utf8')) : null;
      const m = mergeMeasurement(old, results, { image: meta.image, placement: !!meta.placement });
      fs.mkdirSync(path.dirname(MEASURED), { recursive: true });
      fs.writeFileSync(MEASURED, `${JSON.stringify(m, null, 1)}\n`);
      fs.writeFileSync(FITTED, `${JSON.stringify(fitMeasurement(m), null, 2)}\n`);
      console.log(`${path.relative(ROOT, MEASURED)} and ${path.relative(ROOT, FITTED)} updated (${Object.keys(results).length} designs)`);
    }
    if (collect) {
      if (keepsRun(a)) console.log(`${collect}: its results kept on the host; save them with: node scripts/xc7-timing-vivado.mjs --collect ${collect} --update`);
      else ssh(`rm -rf ${remoteOf(collect)}`);
    }
  } finally { if (!process.env.SILINX_KEEP) fs.rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
