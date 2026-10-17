// Silinx - open synthesis (browser + Node): Silinx's front end writes the elaborated design as one
// flat SystemVerilog module (core/synth-verilog.js), and Yosys compiled to WebAssembly (YoWASP,
// package @yowasp/yosys, ISC licence) maps it onto the cells of the device family (synth_xilinx)
// and writes the netlist: JSON (as core/fpga/netlist.js reads it) and Verilog, with its statistics.
// No Xilinx tool is involved. The caller says how Yosys runs: in a Web Worker in the browser
// (web/js/yosys-worker.js), directly in Node (core/synth-open-node.js).
//
//   const r = await synthesizeOpen(design, { family: 'spartan3e', run, onLine })
//   r: { top, files: { '<top>_syn.v', '<top>.json', '<top>_yosys.v', '<top>_stat.txt' }, cells, util,
//        warnings, log }
import { toVerilog } from './synth-verilog.js';
import { rewriteCarryChains, gateAssignments, GATE_MIN } from './carry-chain.js';

// Silinx's device families -> synth_xilinx -family
export const YOSYS_FAMILY = {
  spartan3: 'xc3s', spartan3e: 'xc3se', spartan3a: 'xc3sa', spartan3adsp: 'xc3sda', spartan6: 'xc6s',
  virtex4: 'xc4v', virtex5: 'xc5v', virtex6: 'xc6v', artix7: 'xc7', kintex7: 'xc7', zynq: 'xc7',
};

// families of 4-input LUTs (MUXF5 … MUXF8 combine them)
const LUT4_FAMILIES = new Set(['xc3s', 'xc3se', 'xc3sa', 'xc3sda', 'xc4v']);
// ABC's cost of a LUT of 1 … 6 inputs on those families: a 5-input function is two LUT4s and a
// MUXF5 (one slice), a 6-input one four LUT4s, two MUXF5 and a MUXF6. synth_xilinx's own LUT
// mapping there (LUTs of up to 8 inputs, each split by lut_map.v into LUT4s and MUXF5 … MUXF8)
// makes netlists about 2.5 times larger (research/synth-quality/README.md).
export const LUT4_COSTS = '1,1,1,1,2,4';
// The usual mapping, though, is onto LUT4s alone (#54): with the wider functions ABC, which sees them
// as fast as a LUT4 (#78: it cannot be told otherwise), makes multiplexers and shifters of 5- and
// 6-input functions where LUT4s do as well (the EPFL barrel shifter 1201 LUTs instead of 1707, AES 25 %
// fewer; the design corpus 7 % fewer LUTs, as fast). The mapping on LUT4_COSTS is tried from the same
// netlist (WIDE) and kept when better by DEPTH_RULE (the T80, 7 % smaller with it), as the
// depth-oriented one after it.
export const LUT4_ONLY = '1,1,1,1';

// Shift registers of the 4-input-LUT families as SRL16E (synth_xilinx does not infer them there:
// "Shift register inference not yet supported"). xilinx_srl -fixed turns chains of 3 or more
// flip-flops without a reset (same clock, same enable) into $__XILINX_SHREG_ cells; it must run on
// the bit-level flip-flops before map_ffs (after it they are $_SDFFE_ cells with a reset, which
// xilinx_srl skips). This map file replaces Yosys's own one (cells_map.v), which writes SRLC32E (not
// in these families) for chains of 17 to 32: a chain is SRL16E of 16 stages (address 15) followed
// by the rest; a falling clock is SRL16E_1 (declared in SRL_CELLS: Yosys's cell library does not
// have it, and its IS_CLK_INVERTED would become an inverter on the clock: extractinv of -ise).
// (research/synth-quality/README.md)
export const SRL_MAP_FILE = 'silinx_srl_map.v';
export const SRL_CELLS_FILE = 'silinx_srl_cells.v';
export const SRL_CELLS = `// Silinx: the falling-edge shift register, a black box for Yosys
(* blackbox *)
module SRL16E_1 (output Q, input A0, input A1, input A2, input A3, input CE, (* clkbuf_sink *) input CLK, input D);   // (clkbuf_sink: its clock gets a BUFG, #219)
  parameter [15:0] INIT = 16'h0000;
endmodule
`;
export const SRL_MAP = `// Silinx: $__XILINX_SHREG_ (xilinx_srl) as SRL16E for the 4-input-LUT families
module \\$__XILINX_SHREG_ (input C, input D, input [31:0] L, input E, output Q, output SO);
  parameter DEPTH = 0;
  parameter [DEPTH-1:0] INIT = 0;
  parameter CLKPOL = 1;
  parameter ENPOL = 2;
  // xilinx_srl's INIT shifts out its least significant bit first; SRL16E's INIT[a] is stage a
  function [DEPTH-1:0] brev;
    input [DEPTH-1:0] din;
    integer i;
    begin
      for (i = 0; i < DEPTH; i = i + 1) brev[i] = din[DEPTH-1-i];
    end
  endfunction
  localparam [DEPTH-1:0] INIT_R = brev(INIT);
  // a constant L: a fixed length (xilinx_srl -fixed); otherwise the tap is read at L (-variable, #5)
  parameter _TECHMAP_CONSTMSK_L_ = 0;
  localparam FIXED = &_TECHMAP_CONSTMSK_L_;
  localparam N = (DEPTH + 15) / 16;
  localparam [16*N-1:0] INIT_P = INIT_R;
  wire CE;
  generate
    if (ENPOL == 0) assign CE = ~E;
    else if (ENPOL == 1) assign CE = E;
    else assign CE = 1'b1;
    if (!FIXED && DEPTH > 16) begin
      // a variable tap past 16 stages: per 16 stages, an SRL16E read at the tap and one at stage 15
      // that feeds the next 16 (no SRLC16E: the open flow does not place its cascade, #24); the tap's
      // high bits choose among them
      wire [N:0] ch;
      wire [N-1:0] qs;
      assign ch[0] = D;
      genvar i;
      for (i = 0; i < N; i = i + 1) begin : seg
        if (CLKPOL) SRL16E #(.INIT(INIT_P[16*i +: 16])) tap (.A0(L[0]), .A1(L[1]), .A2(L[2]), .A3(L[3]), .CE(CE), .CLK(C), .D(ch[i]), .Q(qs[i]));
        else SRL16E_1 #(.INIT(INIT_P[16*i +: 16])) tap (.A0(L[0]), .A1(L[1]), .A2(L[2]), .A3(L[3]), .CE(CE), .CLK(C), .D(ch[i]), .Q(qs[i]));
        if (i < N - 1) begin : casc
          if (CLKPOL) SRL16E #(.INIT(INIT_P[16*i +: 16])) last (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(CE), .CLK(C), .D(ch[i]), .Q(ch[i+1]));
          else SRL16E_1 #(.INIT(INIT_P[16*i +: 16])) last (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(CE), .CLK(C), .D(ch[i]), .Q(ch[i+1]));
        end
      end
      assign Q = qs[L[31:4]];
    end else if (DEPTH == 1) begin
      if (CLKPOL) FDRE #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.D(D), .Q(Q), .C(C), .CE(CE), .R(1'b0));
      else FDRE_1 #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.D(D), .Q(Q), .C(C), .CE(CE), .R(1'b0));
    end else if (DEPTH <= 16) begin
      if (CLKPOL) SRL16E #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.A0(L[0]), .A1(L[1]), .A2(L[2]), .A3(L[3]), .CE(CE), .CLK(C), .D(D), .Q(Q));
      else SRL16E_1 #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.A0(L[0]), .A1(L[1]), .A2(L[2]), .A3(L[3]), .CE(CE), .CLK(C), .D(D), .Q(Q));
    end else begin
      wire T;
      if (CLKPOL) SRL16E #(.INIT(INIT_R[15:0])) fpga_srl (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(CE), .CLK(C), .D(D), .Q(T));
      else SRL16E_1 #(.INIT(INIT_R[15:0])) fpga_srl (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(CE), .CLK(C), .D(D), .Q(T));
      \\$__XILINX_SHREG_ #(.DEPTH(DEPTH-16), .INIT(INIT[DEPTH-17:0]), .CLKPOL(CLKPOL), .ENPOL(ENPOL)) fpga_srl_rest (.C(C), .D(T), .L(DEPTH-17), .E(E), .Q(Q));
    end
  endgenerate
endmodule
`;

/**
 * The Yosys commands that map the module `top` onto the cells of the family (synth_xilinx, with
 * the LUT mapping of the 4-input-LUT families replaced: synth_xilinx up to its map_ffs step, the
 * fixed-length shift registers as SRL16E (SRL_MAP: the file `silinx_srl_map.v` given to Yosys), up
 * to its map_luts step, then the steps of map_luts with ABC on LUT4_COSTS, then synth_xilinx from
 * its finalize step). srl: false leaves the shift registers in flip-flops; premap: a file name to
 * write the design to just before the LUT mapping (RTLIL), for remapCommands.
 */
export function synthCommands(top, family, { srl = true, premap = null } = {}) {
  const fam = YOSYS_FAMILY[family];
  if (!fam) throw new Error(`open synthesis: no Yosys mapping for the device family '${family}'`);
  const synth = `synth_xilinx -family ${fam} -ise -flatten -top ${top}`;
  if (!LUT4_FAMILIES.has(fam)) return synth;
 // (the variable taps, #5: xilinx_srl -variable must see the word-level $shiftx, before synth_xilinx's
  // fine step maps it to multiplexers: memory_map (a shift-chain array's words as flip-flops), then
  // xilinx_srl and the map to SRL16E (before map_cells, whose own map writes SRLC32E), then the step;
  // fine's own opt -full run first made t80 7 % larger)
  const shreg = srl ? `${synth} -run :fine; memory_map; xilinx_srl -variable -minlen 3; techmap -map ${SRL_MAP_FILE}; ${synth} -run fine:map_ffs; xilinx_srl -fixed -minlen 3; techmap -map ${SRL_MAP_FILE}; ${synth} -run map_ffs:map_luts` : `${synth} -run :map_luts`;
  return `${shreg}; opt_expr -mux_undef -noclkinv; ${premap ? `write_rtlil ${premap}; ` : ''}abc -luts ${LUT4_ONLY}; ${lutsToCells(synth)}`;
}
const lutsToCells = synth => 'clean; techmap -map +/xilinx/ff_map.v; techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; '
  + `xilinx_dffopt -lut4; opt_lut_ins -tech xilinx; ${synth} -run finalize:`;

// The depth-oriented LUT mapping (the 4-input-LUT families), tried after the usual one: ABC's
// default script for LUTs (strash; …; dch -f; if; mfs2) maps the logic as its structure is: a
// comparator written as a chain of gates stays a chain (the EPFL max benchmark: 45 levels of LUTs,
// 69.9 ns where ISE's XST gets 25.7, #52). This one first balances the logic as sums of products
// (if -g: SOP balancing), then maps it again for area as the default does. The open synthesis
// keeps whichever netlist is faster by its estimate (criticalDelay), when it is not much larger
// (DEPTH_RULE); research/synth-quality/README.md, "Logic depth".
export const DEPTH_ABC = 'strash; dc2; balance; dch -f; if -g; strash; dc2; dch -f; if; mfs2';
// a design whose depth-oriented mapping was kept (its logic depth the limit) is balanced once more and then
// mapped for area again (the EPFL max: 24.8 ns estimated instead of 32.6, for 37 % more LUTs, its slices
// still fewer than ISE's; #52), and that netlist kept when better than the first by DEPTH_RULE, or faster
// than it and, as the first, not larger in proportion than it is faster than the usual mapping (the
// rule against the usual one: the second's LUTs against the first's alone would refuse max's); only for
// these designs, as the second balancing takes long on large ones (EPFL bar: four times as long)
export const DEPTH_ABC2 = 'strash; dc2; balance; dch -f; if -g; strash; dc2; dch -f; if -g; strash; dc2; dch -f; if; mfs2; strash; dch -f; if; mfs2';
export const DEPTH_ABC_FILE = 'silinx_depth.abc';
// LUT delays (#78): ABC maps for depth with every function as fast as a LUT4 (-luts gives costs, not
// delays); its LUT library (read_lut) tells it what a 5-input function (a LUT4 into the MUXF5) and a
// 6-input one (into the MUXF6 too) cost and take: the -4 delays of core/fpga/timing.js (Tilo, Tif5x,
// Tif5 + Tif6y) and a connection (0.45 ns). YoWASP's ABC crashes on read_lut from a script file
// (codeberg.org/YoWASP/yosys/issues/41), not from a script given inline (abcInline). The balancing of
// DEPTH_ABC2 is made both ways, the better kept (EPFL max 21.4 ns and 1055 LUTs with the delays,
// 22.6 ns and 1410 without; serv 12 % faster; the pedestrian crossing as fast with 16 % more LUTs).
export const LUT_LIB_FILE = 'silinx_lut.lib';
export const LUT_LIB = '1 1 1.21\n2 1 1.21\n3 1 1.21\n4 1 1.21\n5 2 1.60\n6 4 1.89\n';
/** An ABC script for `abc -script` inline (+cmd,arg;cmd…), the LUT library read first. */
export const abcInline = script => `+${[`read_lut ${LUT_LIB_FILE}`, ...script.split(';')].map(c => c.trim().replace(/\s+/g, ',')).filter(Boolean).join(';')}`;
export const PREMAP_FILE = 'silinx_premap.il';
// the depth-oriented netlist is kept when its critical path is at least `gain` shorter and it has
// no more LUTs in proportion than it gains in speed, `luts` (10 %) more at least, or it is no slower
// and no larger, and better in one, or (#54) it has `area` (5 %) fewer LUTs at least and is at most
// `slack` (1 %) slower, within the estimate's error (the pong example: 12 % fewer LUTs, 0.6 % slower);
// tried on designs of up to `maxLuts` LUTs (ABC's SOP balancing of the largest, AES's 10 000 LUTs,
// takes minutes and gigabytes)
export const DEPTH_RULE = { gain: 0.03, luts: 0.1, maxLuts: 5000, area: 0.05, slack: 0.01 };
/** Is the depth-oriented mapping kept? ns, luts: [usual, depth-oriented]. */
export function keepDepth(ns, luts, rule = DEPTH_RULE) {
  const faster = ns[1] <= ns[0] * (1 - rule.gain) && luts[1] <= luts[0] * (1 + Math.max(rule.luts, 1 - ns[1] / ns[0]));
  const better = ns[1] <= ns[0] && luts[1] <= luts[0] && (ns[1] < ns[0] || luts[1] < luts[0]);
  const smaller = ns[1] <= ns[0] * (1 + rule.slack) && luts[1] < luts[0] && luts[1] <= luts[0] * (1 - rule.area);
  return faster || better || smaller;
}
/** Is the mapping balanced once more (DEPTH_ABC2) kept? ns, luts: [usual, depth-oriented, balanced once
 *  more], the depth-oriented one kept: better than it (keepDepth), or faster than it (by the rule's gain)
 *  and kept by the rule against the usual mapping. */
export function keepSecond(ns, luts, rule = DEPTH_RULE) {
  return keepDepth([ns[1], ns[2]], [luts[1], luts[2]], rule)
    || (ns[2] <= ns[1] * (1 - rule.gain) && keepDepth([ns[0], ns[2]], [luts[0], luts[2]], rule));
}

/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again,
 *  with the depth-oriented ABC script (DEPTH_ABC, in the file DEPTH_ABC_FILE given to Yosys). */
export function remapCommands(top, family, { script = true, inline = null } = {}) {
  const synth = `synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`;
  const abc = inline ? ` -script ${abcInline(inline)}` : script ? ` -script ${DEPTH_ABC_FILE}` : '';
  return `read_rtlil ${PREMAP_FILE}; abc -luts ${LUT4_COSTS}${abc}; ${lutsToCells(synth)}`;
}

// $scopeinfo cells (kept hierarchy names) are not cells of the device: deleted before writing
const outputs = top => `delete t:$scopeinfo; write_json ${top}.json; write_verilog -noattr ${top}_yosys.v; tee -q -o ${top}_stat.txt stat`;

// the netlist between the two runs of a design with carry chains written as gates (#77)
export const CHAIN_FILE = 'silinx_chains.json';
/** synthCommands in two: up to synth_xilinx's fine step (the coarse netlist), and from it on. */
export function splitCommands(top, family, opts = {}) {
  const cmds = synthCommands(top, family, opts);
  const at = cmds.indexOf(`synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top} -run fine:`);
  return [cmds.slice(0, at).replace(/;\s*$/, ''), cmds.slice(at)];
}

/** The Yosys script: read the flat module, map it, write the netlist and its statistics. */
export function yosysScript(top, family, opts = {}) {
  const cells = LUT4_FAMILIES.has(YOSYS_FAMILY[family]) && opts.srl !== false ? `read_verilog -lib ${SRL_CELLS_FILE}; ` : '';
  return `${cells}read_verilog -sv ${top}_syn.v; ${synthCommands(top, family, opts)}; ${outputs(top)}`;
}

// ------------------------------------------------------------- the critical path of a netlist
// An estimate of the critical path (ns) of a mapped netlist of a 4-input-LUT family, from its cells
// only (before packing, placement and routing): the Spartan-3E -4's logic delays (of
// core/fpga/timing.js) and a fixed delay per connection between slices, none inside a slice (a LUT
// into its MUXF5, carry or flip-flop; the carry chain; MUXF5 into MUXF6…). Paths from flip-flop to
// flip-flop (block RAMs, multipliers, shift registers and distributed RAMs as their sources and
// ends too); a design without them: from its inputs to its outputs. It chooses between two
// mappings of the same design, so relative, not exact.
const NET = 0.45;
const isFF = t => /^(FD|LD)/.test(t);
const isLutCell = t => /^(LUT[1-6]|INV|BUF)$/.test(t);
/** The estimated critical path (ns) of a Yosys JSON netlist (its top module). */
export function criticalDelay(json, top) {
  const nl = typeof json === 'string' ? JSON.parse(json) : json;
  const mod = nl.modules[top] || Object.values(nl.modules).find(m => m.attributes?.top) || Object.values(nl.modules)[0];
  const cells = Object.values(mod?.cells || {});
  const driver = new Map();   // bit -> [cell, port]
  for (const c of cells) for (const [p, bits] of Object.entries(c.connections || {})) if (c.port_directions?.[p] === 'output') for (const b of bits) if (typeof b === 'number') driver.set(b, c);
  const registered = c => c.type === 'MULT18X18SIO' && /1$/.test(String(c.parameters?.PREG ?? ''));
  const ins = c => Object.entries(c.connections || {}).filter(([p]) => c.port_directions?.[p] === 'input');
  let withIO = false;
  const memo = new Map(), busy = new Set();
  // the arrival at a cell's input pin: its driver's output and the connection (none inside a slice)
  const arrIn = (c, p, bit) => {
    const d = typeof bit === 'number' ? driver.get(bit) : null;
    if (!d) return -Infinity;
    const inside = (c.type === 'MUXF5' && /^I[01]$/.test(p) && isLutCell(d.type)) || (/^MUXF[678]$/.test(c.type) && /^I[01]$/.test(p) && /^MUXF/.test(d.type))
      || (/^(MUXCY|XORCY)$/.test(c.type) && p === 'CI' && d.type === 'MUXCY') || (c.type === 'MUXCY' && p === 'S' && isLutCell(d.type))
      || (c.type === 'XORCY' && p === 'LI' && isLutCell(d.type)) || (isFF(c.type) && p === 'D' && (isLutCell(d.type) || /^(MUXF5|MUXF6|XORCY)$/.test(d.type)));
    return arrOut(d, bit) + (inside ? 0 : NET);
  };
  const through = (c, delayOf) => {
    let t = -Infinity;
    for (const [p, bits] of ins(c)) { const d = delayOf(p); if (d !== null) for (const b of bits) t = Math.max(t, arrIn(c, p, b) + d); }
    return t;
  };
  function arrOut(c, bit) {
    if (memo.has(bit)) return memo.get(bit);
    const t = c.type;
    let v;
    if (isFF(t)) v = 0.59;
    else if (/^SRL16/.test(t)) v = 2.0;
    else if (/^RAMB16/.test(t)) v = 2.39;
    else if (/^IBUF/.test(t)) v = withIO ? 0 : -Infinity;
    else if (/^BUFG/.test(t)) v = -Infinity;
    else {
      if (busy.has(bit)) return -Infinity;   // a combinational loop: no path
      busy.add(bit);
      if (isLutCell(t)) v = through(c, () => 0.70);
      else if (t === 'MUXF5') v = through(c, p => (p === 'S' ? 0.74 : 0.32));
      else if (/^MUXF[678]$/.test(t)) v = through(c, p => (p === 'S' ? 0.85 : 0.45));
      else if (t === 'MUXCY') v = through(c, p => (p === 'CI' ? 0.12 : p === 'S' ? 0.25 : 0.95));
      else if (t === 'XORCY') v = through(c, p => (p === 'CI' ? 0.46 : 0.15));
      else if (/^MULT18X18/.test(t)) v = registered(c) ? 1.0 : through(c, p => (/^[AB]$/.test(p) ? 4.9 : null));
      else if (/^RAM\d+X/.test(t)) v = through(c, p => (/^(A\d*|DPRA\d*)$/.test(p) ? 0.75 : null));
      else v = through(c, () => 0.7);
      busy.delete(bit);
    }
    memo.set(bit, v);
    return v;
  }
  // the ends: the setup of flip-flops, shift registers, RAMs and registered multipliers (the outputs withIO)
  const setup = (c, p) => {
    const t = c.type;
    if (isFF(t)) return p === 'D' ? 0.13 : p === 'CE' ? 0.55 : /^(R|S|CLR|PRE|G|GE)$/.test(p) ? 0.91 : null;
    if (/^SRL16/.test(t)) return /^(D|CE)$/.test(p) ? 0.46 : null;
    if (/^RAMB16/.test(t)) return /^(CLK|SSR)/.test(p) ? null : 0.4;
    if (registered(c)) return /^[AB]$/.test(p) ? 5.2 : null;
    if (/^RAM\d+X/.test(t)) return /^(D|WE|A\d*)$/.test(p) ? 0.46 : null;
    if (/^OBUF/.test(t)) return withIO ? 0 : null;
    return null;
  };
  const worst = () => {
    let w = 0;
    for (const c of cells) for (const [p, bits] of ins(c)) { const s = setup(c, p); if (s !== null) for (const b of bits) w = Math.max(w, arrIn(c, p, b) + s); }
    return w;
  };
  const ff = worst();
  if (ff > 0) return ff;
  withIO = true;
  memo.clear();
  return worst();
}

/** The files yosysScript reads: the flat module and Silinx's shift-register map and cells. */
export const yosysFiles = (top, text) => ({ [`${top}_syn.v`]: text, [SRL_MAP_FILE]: SRL_MAP, [SRL_CELLS_FILE]: SRL_CELLS });

/** Cells of a Yosys JSON netlist by type: { LUT4: 286, FDRE: 48, … } (the top module's). */
export function cellCounts(json, top) {
  const nl = typeof json === 'string' ? JSON.parse(json) : json;
  const mod = nl.modules[top] || Object.values(nl.modules).find(m => m.attributes?.top) || Object.values(nl.modules)[0];
  const counts = {};
  for (const c of Object.values(mod?.cells || {})) counts[c.type] = (counts[c.type] || 0) + 1;
  return counts;
}

/** The resources of the cell counts, as the Design Summary lists them. */
export function utilization(counts) {
  const sum = re => Object.entries(counts).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);
  return {
    luts: sum(/^LUT[1-6]$/),
    flipFlops: sum(/^FD/),
    latches: sum(/^LD/),
    muxes: sum(/^MUXF[5-8]$/),
    carry: sum(/^(MUXCY|XORCY|CARRY4)$/),
    shiftRegisters: sum(/^SRL/),
    distributedRam: sum(/^RAM\d+X/),
    blockRam: sum(/^RAMB/),
    multipliers: sum(/^(MULT18X18|DSP48)/),
    clockBuffers: sum(/^BUFG/),
    dcms: sum(/^(DCM|PLL|MMCM)/),
    ios: sum(/^(IBUF|OBUF|IOBUF|OBUFT|IBUFG)/),
    cells: sum(/./),
  };
}

// Yosys messages that say nothing about the design, left out of the log and of the warnings:
// synth_xilinx prints "Shift register inference not yet supported for family xc3se" (and the
// other 4-input-LUT families) on every run, whatever the design (its shift registers become
// flip-flops). (Not -nosrl instead: that option also skips pmux2shiftx, which changes netlists.)
// Its block-RAM mapping (brams_map.v: ports of 64 data and 8 parity bits narrowed to the RAMB16's)
// prints "Resizing cell port <memory>.<i>.<j>.DI from 64 bits to 8 bits" for every block RAM it infers.
export const QUIET = [/^Warning: Shift register inference not yet supported for family \w+\.$/,
  /^Warning: Resizing cell port \S+\.\d+\.\d+\.(DI|DO|DIP|DOP)[AB]? from (64|8) bits to \d+ bits\.$/];

/** The open synthesis's effort from a project's implementation properties (#282): its Optimization Effort,
 *  as XST's: High (optLevel 2) 'high', else (Normal, the default) 'normal'. */
export const synthEffort = impl => (String(impl?.optLevel) === '2' ? 'high' : 'normal');

/**
 * Synthesize an elaborated design (core/elaborate.js). run(args, files, onLine) runs Yosys and
 * resolves with its output files ({ name: text }), or rejects with an error whose `lines` holds
 * Yosys's messages. onLine receives Yosys's output line by line. depth (true): on the
 * 4-input-LUT families the design (mapped onto LUT4s alone) is mapped again with the wider functions
 * (LUT4_COSTS) and for logic depth (DEPTH_ABC), each netlist kept when better (DEPTH_RULE); r.depth says
 * what happened: { tried, kept, wide: { ns, luts, kept } of the mapping with the wider functions,
 * ns: [usual, depth-oriented] (criticalDelay), luts: [usual, depth-oriented] (usual: the mapping kept
 * of the two before), second: { ns, luts, kept } of the mapping balanced once more (DEPTH_ABC2), when
 * the depth-oriented one was kept, and delays: { ns, luts, kept } of the same with the LUT delays (#78) }.
 * effort ('high'): 'normal', the synthesis's Optimization Effort Normal (#282), is one Yosys run, the
 * usual mapping alone (no other mapping tried, no carry chains recovered: as depth false).
 */
export async function synthesizeOpen(design, { family = 'spartan3e', run, onLine = () => {}, depth = true, effort = 'high' } = {}) {
  const { text, top, warnings, shiftArrays = [] } = toVerilog(design);
  if (effort === 'normal') depth = false;
  const tryDepth = depth && LUT4_FAMILIES.has(YOSYS_FAMILY[family]);
  const opts = tryDepth ? { premap: PREMAP_FILE } : {};
  const log = [];
  const quiet = l => QUIET.some(re => re.test(l));
  const line = l => { if (!quiet(l)) { log.push(l); onLine(l); } };
  // a mapping (its run's output) and, from the design as it was before its LUT mapping, the depth-oriented
  // one: the faster kept (DEPTH_RULE); its messages apart, only a warning of its own joins the log
  async function withDepth(out, say, seen) {
    // (a kept netlist's warnings: those the run before did not print, the netlist being the same before
    // the LUT mapping)
    const sayNew = l => { if (/^Warning:/.test(l) && !seen.includes(l)) { seen.push(l); say(l); } };
    const json = out[`${top}.json`];
    if (!json) throw Object.assign(new Error('Yosys wrote no netlist'), { lines: log });
    let chosen = out, cells = cellCounts(json, top);
    const info = { tried: false, kept: false, ns: null, luts: null };
    if (tryDepth && out[PREMAP_FILE] && utilization(cells).luts <= DEPTH_RULE.maxLuts) {
      // the mapping with the wider functions too (LUT4_COSTS, ABC's own script), kept when better than
      // the one onto LUT4s alone by DEPTH_RULE; the depth-oriented one is then measured against it
      // (the two from the same netlist, at once: in parallel when run() has several Yosys, #86)
      // (delays: the script inline with the LUT library, #78)
      const remap = (script, lines, delays = false) => run(['-q', '-p', `${remapCommands(top, family, delays ? { inline: script } : { script: !!script })}; ${outputs(top)}`],
        { [PREMAP_FILE]: asText(out[PREMAP_FILE]), ...(script && !delays && { [DEPTH_ABC_FILE]: script }), ...(delays && { [LUT_LIB_FILE]: LUT_LIB }) },
        l => { if (!quiet(l)) lines.push(l); });
      let base = json;
      const linesW = [], lines2 = [], lines3 = [], lines4 = [];
      const first = Promise.all([remap(null, linesW), remap(DEPTH_ABC, lines2)]);
      // the second balancing (below) from the same netlist: with 4 Yosys or more at a time started now,
      // after the first ones, only its choice waiting for them (#277); with fewer, only when it is needed
      const second = () => Promise.all([remap(DEPTH_ABC2, lines3), remap(DEPTH_ABC2, lines4, true)]);
      const early = (run.parallel || 1) >= 4 ? second() : null;
      early?.catch(() => {});
      const [outW, out2] = await first;
      const jsonW = outW[`${top}.json`];
      if (jsonW) {
        const cellsW = cellCounts(jsonW, top);
        const nsW = [criticalDelay(json, top), criticalDelay(jsonW, top)], lutsW = [utilization(cells).luts, utilization(cellsW).luts];
        info.wide = { ns: nsW[1], luts: lutsW[1], kept: keepDepth(nsW, lutsW) };
        if (info.wide.kept) {
          chosen = outW;
          cells = cellsW;
          base = jsonW;
          for (const l of linesW) sayNew(l);
        }
      }
      const json2 = out2[`${top}.json`];
      if (json2) {
        const cells2 = cellCounts(json2, top);
        const ns = [criticalDelay(base, top), criticalDelay(json2, top)], luts = [utilization(cells).luts, utilization(cells2).luts];
        // (against the mapping onto LUT4s alone; or, faster than it, against the one with the wider
        // functions, as before #54: the LUT4s alone smaller, a design limited by its depth would keep them)
        const kept = info.wide && !info.wide.kept ? keepSecond([info.wide.ns, ...ns], [info.wide.luts, ...luts]) : keepDepth(ns, luts);
        Object.assign(info, { tried: true, kept, ns, luts });
        if (info.kept) {
          chosen = out2;
          cells = cells2;
          for (const l of lines2) sayNew(l);
          // balanced once more (DEPTH_ABC2), with and without the LUT delays (#78), at once; each kept
          // by keepSecond, the one with the delays when both are and it is better by DEPTH_RULE
          const [out3, out4] = await (early || second());
          const cand = (o, lines) => {
            const j = o[`${top}.json`];
            if (!j) return null;
            const c = cellCounts(j, top), n = criticalDelay(j, top), l = utilization(c).luts;
            return { out: o, lines, cells: c, ns: n, luts: l, kept: keepSecond([...ns, n], [...luts, l]) };
          };
          const a = cand(out3, lines3), b = cand(out4, lines4);
          const useB = b?.kept && (!a?.kept || keepDepth([a.ns, b.ns], [a.luts, b.luts]));
          const best = useB ? b : a?.kept ? a : null;
          if (a) info.second = { ns: a.ns, luts: a.luts, kept: best === a };
          if (b) info.delays = { ns: b.ns, luts: b.luts, kept: best === b };
          if (best) {
            chosen = best.out;
            cells = best.cells;
            for (const l of best.lines) sayNew(l);
          }
        }
      }
    }
    return { chosen, cells, info, ns: criticalDelay(chosen[`${top}.json`], top) };
  }
  // a design with logic written as gates: its carry chains (adders, comparators: core/carry-chain.js, #77)
  // made $alu cells between two runs of Yosys (up to synth_xilinx's fine step, the netlist rewritten, then on
  // from it); mapped both with and without them, the faster kept (as the depth-oriented mapping: a chain of
  // a comparator that then combines several bits at once, EPFL max, is slower). A design without such a
  // chain is synthesized as before, in one run.
  let res = null, chains = [];
  if (effort !== 'normal' && LUT4_FAMILIES.has(YOSYS_FAMILY[family]) && gateAssignments(design) >= GATE_MIN) {
    const [first, rest] = splitCommands(top, family, opts);
    const lines1 = [];
    const keep = l => { if (!quiet(l)) lines1.push(l); };
    const pre = await run(['-q', '-p', `read_verilog -lib ${SRL_CELLS_FILE}; read_verilog -sv ${top}_syn.v; ${first}; select -module ${top}; write_json -selected ${CHAIN_FILE}`],
      yosysFiles(top, text), keep);
    const rw = pre[CHAIN_FILE] ? rewriteCarryChains(asText(pre[CHAIN_FILE]), { top }) : { chains: [] };
    if (rw.chains.length) {
      const linesC = [], linesN = [];
      // (both at once, #86)
      const [resC, resN] = await Promise.all([
        run(['-q', '-p', `read_verilog -lib -specify +/xilinx/cells_sim.v; read_verilog -lib +/xilinx/cells_xtra.v; read_verilog -lib ${SRL_CELLS_FILE}; read_json ${CHAIN_FILE}; hierarchy -top ${top}; ${rest}; ${outputs(top)}`],
          { ...yosysFiles(top, text), [CHAIN_FILE]: JSON.stringify(rw.json) }, l => { if (!quiet(l)) linesC.push(l); }).then(outC => withDepth(outC, () => {}, linesC)),
        run(['-q', '-p', yosysScript(top, family, opts)], yosysFiles(top, text), l => { if (!quiet(l)) linesN.push(l); }).then(outN => withDepth(outN, () => {}, linesN)),
      ]);
      const withChains = keepDepth([resN.ns, resC.ns], [utilization(resN.cells).luts, utilization(resC.cells).luts]);
      if (withChains) { chains = rw.chains; for (const l of [...lines1, ...linesC]) line(l); res = resC; }
      else { for (const l of linesN) line(l); res = resN; }
    }
  }
  if (!res) res = await withDepth(await run(['-q', '-p', yosysScript(top, family, opts)], yosysFiles(top, text), line), line, [...log]);
  const { chosen, cells, info } = res;
  const files = { [`${top}_syn.v`]: text, [`${top}.json`]: chosen[`${top}.json`], [`${top}_yosys.v`]: chosen[`${top}_yosys.v`] || '', [`${top}_stat.txt`]: chosen[`${top}_stat.txt`] || '' };
  // (a shift-chain array read at a variable tap is made flip-flops on purpose, then SRL16Es: Yosys's
  // "Replacing memory \m with list of registers" says nothing to the user there, #5)
  const expected = l => shiftArrays.some(n => l.startsWith(`Warning: Replacing memory ${n} with list of registers.`));
  return { top, files, cells, util: utilization(cells), warnings: [...warnings, ...log.filter(l => /^Warning:/.test(l) && !expected(l))], log, depth: info, chains };
}

/**
 * What a failed Yosys run says (#153): { message, code, crash }. Yosys's own error exit has an exit
 * code; anything else is a crash of its WebAssembly module, e.g. a C++ exception it does not catch
 * (std::bad_alloc when the browser gives it no more memory), which reaches JavaScript as a
 * WebAssembly.Exception, or a RangeError, without a usable message.
 */
export function yosysError(e) {
  if (e?.code !== undefined) return { message: `Yosys failed (exit code ${e.code})`, code: e.code, crash: false };
  const wasmException = typeof WebAssembly !== 'undefined' && WebAssembly.Exception && e instanceof WebAssembly.Exception;
  const what = wasmException ? 'an exception inside its WebAssembly module that it does not handle (out of memory?)'
    : typeof e?.message === 'string' && e.message ? e.message
    : e?.name || (e != null && typeof e !== 'object' ? String(e) : `an error without a message (${Object.prototype.toString.call(e)})`);
  return { message: `Yosys failed: ${what}`, code: undefined, crash: true };
}

/** Text of a Yosys output file (YoWASP gives strings, or bytes for binary files). */
export const asText = v => (typeof v === 'string' ? v : v instanceof Uint8Array ? new TextDecoder().decode(v) : '');

/**
 * Line splitter for Yosys's stdout / stderr byte streams: feed(bytes) calls onLine for each complete
 * line, feed.end() (the end of the run) flushes the rest. YoWASP 0.70 calls the stream with null after
 * each write (a flush, even in the middle of a line: "Warning: " then the message): not the end. The
 * lines are plain text: Yosys 0.70 colours its log (ANSI escapes, "\x1b[93mWarning: \x1b[0m…") even
 * when it is not a terminal, and its option --no-color is unknown to the earlier versions; the escapes
 * are dropped here (one place for every run).
 */
export function lineStream(onLine) {
  const dec = new TextDecoder();
  const plain = l => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  let buf = '';
  const feed = bytes => {
    if (!bytes) return;
    buf += dec.decode(bytes, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { onLine(plain(buf.slice(0, i).replace(/\r$/, ''))); buf = buf.slice(i + 1); }
  };
  // (the rest: a last line with no newline; not the escapes alone that end Yosys 0.70's output)
  feed.end = () => { buf = plain(buf + dec.decode()); if (buf) onLine(buf); buf = ''; };
  return feed;
}

/**
 * The code of a Yosys worker (as web/js/yosys-worker.js) that loads Yosys from bundleUrl (YoWASP's
 * gen/bundle.js): for a worker started from a Blob, with no file of its own.
 */
export function yosysWorkerSource(bundleUrl) {
  return `import { runYosys } from ${JSON.stringify(String(bundleUrl))};
const lineStream = ${lineStream};
const asText = ${asText};
const yosysError = ${yosysError};
self.onmessage = async ({ data: { id, args, files } }) => {
  const out = lineStream(line => self.postMessage({ id, line }));
  try {
    const res = await runYosys(args, files, { stdout: out, stderr: out });
    out.end();
    self.postMessage({ id, files: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, asText(v)])) });
  } catch (e) {
    out.end();
    const { message, code, crash } = yosysError(e);
    self.postMessage({ id, error: message, code, crash });
  }
};
`;
}
