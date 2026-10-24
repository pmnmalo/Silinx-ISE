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
import { rewriteCarryChains, gateAssignments, GATE_MIN, ADDER_MIN } from './carry-chain.js';
import { readYosysJson } from './fpga/netlist.js';
import { pack } from './fpga/pack.js';
import { fsmProbeCommands, fsmChosen, fsmExtractCommands, fsmForceCommands, fsmInits, fsmRestCommands, markWires, setInits, oldStateInits, refusedForUsers, quietForced, FSM_PRE_FILE, FSM_MARKED_FILE, FSM_POST_FILE, FSM_ENC_FILE, FSM_DETECT_FILE, FSM_FORCED_FILE } from './synth-fsm.js';
import { asText } from './synth-open-yosys.js';
import {
  DEEP_RULE, criticalDelay, deepDesign, logicLevels, pathEnds
} from './synth-open-path.js';
import { mountDepth } from './synth-open-depth.js';
export {
  DEEP_RULE, criticalDelay, deepDesign, logicLevels, pathEnds
};
export { asText, lineStream, readableBlobs, runYosysOnce, yosysError, yosysWorkerSource } from './synth-open-yosys.js';

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

// Wide multiplexers (#511): onto LUT4s alone a 128:1 multiplexer (iwls05-spi's data[bit_pos]) is 6 or 7
// LUTs deep; XST builds it, as a 32:1 one, from LUTs into MUXF5 … MUXF8 (one LUT, then the F-multiplexers
// of the CLB, no general routing between them). The mapping with the wider functions does not either (ABC
// sees a 4:1 multiplexer as one 6-input LUT: 4 LUT4s, 2 MUXF5 and a MUXF6 each). Yosys's muxcover finds
// the trees of 8 and 16 inputs among the 2:1 multiplexers before the LUT mapping; MUXF_MAP makes each one
// 2:1 multiplexers on its first select, left to ABC (a LUT each, with the logic before it), into MUXF5,
// MUXF6 (and MUXF7). Not for every design: a tree whose first select comes late is slower (the T80, 15 %
// by the estimate) than ABC's own mapping, which puts the late select last; and its slices are full
// (their BX / BY select the F-multiplexers: no flip-flop of another net). So the usual run counts the
// trees (MUX_COUNT_FILE) and, with some, the design is mapped again with them (muxfRemapCommands), that
// netlist kept when better by DEPTH_RULE (iwls05-spi: 12.7 ns estimated instead of 14.8, 745 LUTs instead
// of 886). (4:1 trees too, -mux4: serv 29 % slower by the estimate, none faster.) Full trees only (-nopartial,
// #554): muxcover's partial trees (some leaves missing) made a wrong netlist of secworks-sha256's core with -mux16,
// with these F-multiplexers or 2:1 multiplexers in their place alike; -mux8 alone, or -nopartial, kept it right.
export const MUXCOVER = 'muxcover -mux8 -mux16 -nodecode -nopartial';
export const MUXF_MAP_FILE = 'silinx_muxf_map.v';
export const MUXF_MAP = `// Silinx: muxcover's trees of 2:1 multiplexers onto MUXF5 / MUXF6 / MUXF7 (#511)
module \\$_MUX4_ (input A, B, C, D, S, T, output Y);
  wire a, b;
  \\$_MUX_ l0 (.A(A), .B(B), .S(S), .Y(a));
  \\$_MUX_ l1 (.A(C), .B(D), .S(S), .Y(b));
  MUXF5 f5 (.I0(a), .I1(b), .S(T), .O(Y));
endmodule
module \\$_MUX8_ (input A, B, C, D, E, F, G, H, S, T, U, output Y);
  wire a, b;
  \\$_MUX4_ m0 (.A(A), .B(B), .C(C), .D(D), .S(S), .T(T), .Y(a));
  \\$_MUX4_ m1 (.A(E), .B(F), .C(G), .D(H), .S(S), .T(T), .Y(b));
  MUXF6 f6 (.I0(a), .I1(b), .S(U), .O(Y));
endmodule
module \\$_MUX16_ (input A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, S, T, U, V, output Y);
  wire a, b;
  \\$_MUX8_ m0 (.A(A), .B(B), .C(C), .D(D), .E(E), .F(F), .G(G), .H(H), .S(S), .T(T), .U(U), .Y(a));
  \\$_MUX8_ m1 (.A(I), .B(J), .C(K), .D(L), .E(M), .F(N), .G(O), .H(P), .S(S), .T(T), .U(U), .Y(b));
  MUXF7 f7 (.I0(a), .I1(b), .S(V), .O(Y));
endmodule
`;
// A 6-input function of ABC's mapping with the wider functions (LUT4_COSTS) is split by Yosys's lut_map.v on its
// last two inputs, whatever the function: four LUT4s, two MUXF5 and a MUXF6. A 4:1 multiplexer is one (its two
// selects and four data inputs), and on its first select it is two 2:1 multiplexers into a MUXF5: two LUT4s, as
// XST builds it. LUT6_MAP, before lut_map.v, splits a 6-input function on the input whose two cofactors each
// depend on 4 of the other inputs at most, when there is one: two LUT4s into a MUXF5 (one slice, faster than
// through the MUXF6); the others fail it and go on to lut_map.v. The EPFL barrel shifter (128-bit, gates), whose
// wider mapping is 384 such functions: 896 LUTs instead of 1664 (and 1156 onto LUT4s alone; XST 939).
// (Yosys's constant functions, per distinct table, on the 6-input $luts alone: about 1 s more per remap of the T80;
// research/synth-quality/README.md, "4:1 multiplexers in the wider mapping".)
export const LUT6_MAP_FILE = 'silinx_lut6_map.v';
export const LUT6_MAP = `// Silinx: a 6-input $lut as two LUT4s and a MUXF5 when one of its inputs leaves two cofactors of 4 inputs at most (#54)
module \\$lut (A, Y);
  parameter WIDTH = 0;
  parameter LUT = 0;
  (* force_downto *)
  input [WIDTH-1:0] A;
  output Y;
  // the entries of a 64-bit table with input v = 1
  function [63:0] ones(input integer v);
    case (v)
      0: ones = 64'hAAAAAAAAAAAAAAAA;
      1: ones = 64'hCCCCCCCCCCCCCCCC;
      2: ones = 64'hF0F0F0F0F0F0F0F0;
      3: ones = 64'hFF00FF00FF00FF00;
      4: ones = 64'hFFFF0000FFFF0000;
      default: ones = 64'hFFFFFFFF00000000;
    endcase
  endfunction
  // which inputs each cofactor depends on: bit 12 * v + 6 * b + k set when the table t with input v = b
  // depends on input k (on 64-bit words: the entries where t changes with input k, then those of them with v = b)
  function [71:0] deps(input [63:0] t);
    reg [63:0] x;
    integer k, v;
    begin
      deps = 0;
      for (k = 0; k < 6; k = k + 1) begin
        x = (t ^ (t >> (1 << k))) & ~ones(k);
        for (v = 0; v < 6; v = v + 1) if (v != k) begin
          deps[12 * v + k] = |(x & ~ones(v));
          deps[12 * v + 6 + k] = |(x & ones(v));
        end
      end
    end
  endfunction
  // the inputs of the cofactor v = b, but v
  function integer count(input [71:0] d, input integer v, input integer b);
    integer k;
    begin
      count = 0;
      for (k = 0; k < 6; k = k + 1) count = count + d[12 * v + 6 * b + k];
    end
  endfunction
  // the input to split on: both cofactors of 4 inputs at most (6: none); the highest such
  function integer split(input [71:0] d);
    integer v;
    begin
      split = 6;
      for (v = 0; v < 6; v = v + 1) if (count(d, v, 0) <= 4 && count(d, v, 1) <= 4) split = v;
    end
  endfunction
  // the input other than v the cofactor v = b does not depend on (the highest)
  function integer drop(input [71:0] d, input integer v, input integer b);
    integer k;
    begin
      drop = 6;
      for (k = 0; k < 6; k = k + 1) if (k != v && !d[12 * v + 6 * b + k]) drop = k;
    end
  endfunction
  // the 16-bit table of the cofactor v = b on the four inputs other than v and d, in their order
  function [15:0] tt4(input [63:0] t, input integer v, input integer b, input integer d);
    integer i, j, k, n;
    begin
      for (i = 0; i < 16; i = i + 1) begin
        j = b << v;
        n = 0;
        for (k = 0; k < 6; k = k + 1) if (k != v && k != d) begin j = j | (((i >> n) & 1) << k); n = n + 1; end
        tt4[i] = t[j];
      end
    end
  endfunction
  generate
    if (WIDTH == 6) begin
      localparam [71:0] DEP = deps(LUT);
      localparam integer V = split(DEP);
      if (V < 6) begin
        localparam integer D0 = drop(DEP, V, 0), D1 = drop(DEP, V, 1);
        // each LUT4's inputs: the six but V and D0 (D1), in their order
        wire [3:0] B0, B1;
        genvar k;
        for (k = 0; k < 6; k = k + 1) begin : pick
          localparam integer N0 = k - (k > V) - (k > D0), N1 = k - (k > V) - (k > D1);
          if (k != V && k != D0) assign B0[N0] = A[k];
          if (k != V && k != D1) assign B1[N1] = A[k];
        end
        wire f0, f1;
        LUT4 #(.INIT(tt4(LUT, V, 0, D0))) lut0 (.O(f0), .I0(B0[0]), .I1(B0[1]), .I2(B0[2]), .I3(B0[3]));
        LUT4 #(.INIT(tt4(LUT, V, 1, D1))) lut1 (.O(f1), .I0(B1[0]), .I1(B1[1]), .I2(B1[2]), .I3(B1[3]));
        MUXF5 mux5 (.I0(f0), .I1(f1), .S(A[V]), .O(Y));
      end else begin
        wire _TECHMAP_FAIL_ = 1;
      end
    end else begin
      wire _TECHMAP_FAIL_ = 1;
    end
  endgenerate
endmodule
`;
export const MUX_COUNT_FILE = 'silinx_muxes.txt';
// (counted on a copy of the design: muxcover changes it)
const MUX_COUNT = `design -save silinx_premap; ${MUXCOVER}; tee -q -o ${MUX_COUNT_FILE} select -count t:$_MUX8_ t:$_MUX16_; design -load silinx_premap`;
/** The wide multiplexer trees the usual run counted (MUX_COUNT_FILE), 0 when it did not count them. */
export const muxTrees = out => +(/^(\d+) objects/m.exec(asText(out?.[MUX_COUNT_FILE]) || '')?.[1] || 0);

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
  // (OUTFF: the last stage of a fixed-length chain in a flip-flop, #502; 0 for the chain before it)
  parameter OUTFF = 1;
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
    if (FIXED && OUTFF && DEPTH > 1) begin
      // a fixed length: its last stage a flip-flop, the stages before it SRL16Es (#502): an SRL16E's output
      // is slow (Treg 3.76 ns against a flip-flop's Tcko 0.59 on the -4), the chain's output then a
      // flip-flop's, as XST does; INIT[0] is the last stage's
      wire T;
      \\$__XILINX_SHREG_ #(.DEPTH(DEPTH-1), .INIT(INIT[DEPTH-1:1]), .CLKPOL(CLKPOL), .ENPOL(ENPOL), .OUTFF(0)) fpga_srl_chain (.C(C), .D(D), .L(DEPTH-2), .E(E), .Q(T));
      if (CLKPOL) FDRE #(.INIT(INIT[0])) fpga_srl_out (.D(T), .Q(Q), .C(C), .CE(CE), .R(1'b0));
      else FDRE_1 #(.INIT(INIT[0])) fpga_srl_out (.D(T), .Q(Q), .C(C), .CE(CE), .R(1'b0));
    end else if (!FIXED && DEPTH > 16) begin
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
      \\$__XILINX_SHREG_ #(.DEPTH(DEPTH-16), .INIT(INIT[DEPTH-17:0]), .CLKPOL(CLKPOL), .ENPOL(ENPOL), .OUTFF(0)) fpga_srl_rest (.C(C), .D(T), .L(DEPTH-17), .E(E), .Q(Q));
    end
  endgenerate
endmodule
`;

// The asynchronous-read memories as distributed RAM (#54). synth_xilinx's memory step (memory_libmap) prices a
// memory left to logic at a flip-flop per bit and leaves out its read multiplexers (about a LUT per bit and read
// port): the T80's register file (two arrays of 8 × 8 bits, written at one address, read at three) is cheaper so
// as 128 flip-flops than as 32 RAM16X1D (two copies for the three read ports), its multiplexers then a seventh of
// the T80's LUTs. With each bit priced at LUTRAM_COST it is RAM16X1D. The usual mapping is then slower (the
// RAM's read address comes from about 11 levels of LUTs, which the multiplexers absorbed), the balanced ones not
// (research/synth-quality/README.md, "The T80's register file as distributed RAM"): a variant of High's mappings
// (synthesizeOpen) for a design whose usual run left memories written to in logic (MEMORIES_FILE: counted, without
// changing the netlist, after the memory step; the variant's own run counts those left at LUTRAM_COST, and its mappings are
// made when it took some). The families whose memory step reads these libraries (synth_xilinx's own).
export const LUTRAM_COST = 2;
export const MEMORIES_FILE = 'silinx_memories.txt';
const LUTRAM_FAMILIES = new Set(['xc3s', 'xc3se', 'xc3sa']);
// (the memories written to: a ROM's price is another, -logic-cost-rom)
const MEMORIES_COUNT = `tee -q -o ${MEMORIES_FILE} select -count t:$mem_v2 r:WR_PORTS>0 %i`;
/** The memories a run of synthCommands (with premap, or lutram) left to logic after its memory step (MEMORIES_FILE);
 *  null when it did not count them. */
export function logicMemories(out) {
  const n = /^(\d+) objects/m.exec(asText(out?.[MEMORIES_FILE]))?.[1];
  return n === undefined ? null : +n;
}
/** synth_xilinx up to its fine step: lutram, its memory step at LUTRAM_COST; count (or lutram), the memories it
 *  leaves to logic counted into MEMORIES_FILE. */
export function memorySteps(synth, { lutram = false, count = false } = {}) {
  if (lutram) return `${synth} -run :map_memory; memory_libmap -lib +/xilinx/lutrams_xcv.txt -lib +/xilinx/brams_xc2v.txt -logic-cost-ram ${LUTRAM_COST}; `
    + `techmap -map +/xilinx/lutrams_xcv_map.v; techmap -map +/xilinx/brams_xc2v_map.v; ${MEMORIES_COUNT}; ${synth} -run map_ffram:fine`;
  if (count) return `${synth} -run :map_ffram; ${MEMORIES_COUNT}; ${synth} -run map_ffram:fine`;
  return `${synth} -run :fine`;
}
const memoryOpts = (fam, { premap = null, lutram = false } = {}) => ({ lutram: lutram && LUTRAM_FAMILIES.has(fam), count: !!premap && !lutram && LUTRAM_FAMILIES.has(fam) });

/**
 * The Yosys commands that map the module `top` onto the cells of the family (synth_xilinx, with
 * the LUT mapping of the 4-input-LUT families replaced: synth_xilinx up to its map_ffs step, the
 * fixed-length shift registers as SRL16E (SRL_MAP: the file `silinx_srl_map.v` given to Yosys), up
 * to its map_luts step, then the steps of map_luts with ABC on LUT4_COSTS, then synth_xilinx from
 * its finalize step). srl: false leaves the shift registers in flip-flops; premap: a file name to
 * write the design to just before the LUT mapping (RTLIL), for remapCommands (and the memories left to logic
 * counted, MEMORIES_FILE); lutram: the memories priced at LUTRAM_COST (#54).
 */
export function synthCommands(top, family, { srl = true, premap = null, lutram = false } = {}) {
  const fam = YOSYS_FAMILY[family];
  if (!fam) throw new Error(`open synthesis: no Yosys mapping for the device family '${family}'`);
  const synth = `synth_xilinx -family ${fam} -ise -flatten -top ${top}`;
  if (!LUT4_FAMILIES.has(fam)) return synth;
 // (the variable taps, #5: xilinx_srl -variable must see the word-level $shiftx, before synth_xilinx's
  // fine step maps it to multiplexers: memory_map (a shift-chain array's words as flip-flops), then
  // xilinx_srl and the map to SRL16E (before map_cells, whose own map writes SRLC32E), then the step;
  // fine's own opt -full run first made t80 7 % larger)
  const shreg = srl ? `${memorySteps(synth, memoryOpts(fam, { premap, lutram }))}; memory_map; xilinx_srl -variable -minlen 3; techmap -map ${SRL_MAP_FILE}; ${synth} -run fine:map_ffs; xilinx_srl -fixed -minlen 3; techmap -map ${SRL_MAP_FILE}; ${synth} -run map_ffs:map_luts` : `${synth} -run :map_luts`;
  return `${shreg}; opt_expr -mux_undef -noclkinv; ${premap ? `write_rtlil ${premap}; ${MUX_COUNT}; ` : ''}abc -luts ${LUT4_ONLY}; ${lutsToCells(synth)}`;
}
// The clock enables on the critical path (#653): Yosys gives a flip-flop whose next state is held under a
// condition that condition as its clock enable (FDRE's CE), its logic apart from the D logic's; a critical path
// that ends there pays the CE's setup (Tceck 0.555 ns on the -4, against the D LUT's 0.13 after it), after the
// enable's own levels of LUTs. XST, for the same logic, often has the enable in the LUT before D (D = CE ? d : Q),
// mapped with the rest of the next state's logic. FOLD_CE_MAP does that for the flip-flops chosen (their names
// read from the file FOLD_CE_FILE): their enable a multiplexer before D, CE tied high, left to ABC with the logic
// around it. For every flip-flop it would cost much (on the slower designs of the corpus 1.1 to 1.9 times the
// LUTs); for those whose enable ends the critical path (criticalEnables) it may save a level and the CE's setup.
export const FOLD_CE_FILE = 'silinx_fold_ce.txt';
export const FOLD_CE_MAP_FILE = 'silinx_fold_ce.v';
const foldModule = (type, clr) => `module ${type} (output Q, input C, CE, D, ${clr});
  parameter [0:0] INIT = 1'b0;
  wire d;
  \\$_MUX_ fold (.A(Q), .B(D), .S(CE), .Y(d));
  ${type} #(.INIT(INIT)) _TECHMAP_REPLACE_ (.Q(Q), .C(C), .CE(1'b1), .D(d), .${clr}(${clr}));
endmodule
`;
export const FOLD_CE_MAP = `// Silinx: a flip-flop's clock enable folded into its D logic (#653)
${[['FDRE', 'R'], ['FDSE', 'S'], ['FDCE', 'CLR'], ['FDPE', 'PRE']].flatMap(([t, c]) => [foldModule(t, c), foldModule(`${t}_1`, c)]).join('')}`;
/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again with the clock
 *  enables of the flip-flops listed in the file FOLD_CE_FILE (module/cell, a line each) folded into their D logic
 *  (FOLD_CE_MAP, in the file FOLD_CE_MAP_FILE), onto LUT4s alone as the usual mapping (or with the ABC script given). */
export function foldRemapCommands(top, family, { script = null } = {}) {
  return `read_rtlil ${PREMAP_FILE}; select -set silinx_fold -read ${FOLD_CE_FILE}; techmap -max_iter 1 -map ${FOLD_CE_MAP_FILE} @silinx_fold; select -clear; opt_expr -mux_undef -noclkinv; `
    + `abc -luts ${LUT4_ONLY}${script ? ` -script ${abcPlain(script)}` : ''}; ${lutsToCells(`synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`)}`;
}
// The critical path's LUTs mapped again for speed (#652): on a small control path ABC's mapping follows the
// logic as written (spi-fpga-slave's enable, `load | shift`, 3 levels of LUTs where XST has 2). SPEED_ABC is
// the usual mapping's script (Yosys's own for -luts) with ABC's speedup after the first mapping: the LUTs
// on the critical path made gates again with their timing-critical cuts as choices, and mapped once more
// (spi-fpga-slave 5.04 ns estimated -> 3.89, vtr-stereovision3 7.70 -> 6.55, itc99-b09 6.19 -> 5.04). A
// candidate from the netlist before the LUT mapping, kept when better by DEPTH_RULE (slower on others: b05).
export const SPEED_ABC = 'strash; &get -n; &fraig -x; &put; scorr; dc2; dretime; strash; dch -f; if; speedup; if; mfs2; lutpack -S 1';
/** An ABC script for `abc -script` inline (+cmd,arg;cmd…), with the LUT library of `abc -luts`. */
export const abcPlain = script => `+${script.split(';').map(c => c.trim().replace(/\s+/g, ',')).filter(Boolean).join(';')}`;
/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again onto LUT4s alone
 *  with the ABC script given (SPEED_ABC). */
export function speedRemapCommands(top, family, script = SPEED_ABC) {
  return `read_rtlil ${PREMAP_FILE}; abc -luts ${LUT4_ONLY} -script ${abcPlain(script)}; ${lutsToCells(`synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`)}`;
}
/** The flip-flops whose clock enable ends a critical path of a mapped netlist (pathEnds), `margin` ns from the
 *  worst at most: their cell names. */
export function criticalEnables(json, top, margin = 0) {
  const { worst, ends } = pathEnds(json, top);
  return [...new Set(ends.filter(e => e.port === 'CE' && /^FD/.test(e.type) && e.ns >= worst - margin).map(e => e.cell))];
}
/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again with its
 *  wide multiplexers onto MUXF5 … MUXF7 (MUXCOVER, MUXF_MAP in the file MUXF_MAP_FILE), the rest onto LUT4s
 *  alone as the usual mapping (#511). */
export function muxfRemapCommands(top, family) {
  return `read_rtlil ${PREMAP_FILE}; ${MUXCOVER}; techmap -map ${MUXF_MAP_FILE}; abc -luts ${LUT4_ONLY}; ${lutsToCells(`synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`)}`;
}
const lutsToCells = (synth, { lut6 = false } = {}) => `clean; techmap -map +/xilinx/ff_map.v; ${lut6 ? `techmap -map ${LUT6_MAP_FILE} t:$lut r:WIDTH=6 %i; ` : ''}techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; `
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
// and balanced twice more (#52), with the LUT delays, a third candidate kept as the other two: a priority
// chain or a comparator tree is balanced further each time (the EPFL priority 8.8 ns estimated instead of 16.5,
// max 21.1 instead of 23.0); not in place of DEPTH_ABC2, slower on others (serv 7 %, the EPFL router 8 %).
// DEPTH_ABC2 onto LUT4s alone (LUT4_ONLY, #370; DEPTH_ABC2_LUT4, its mfs2 on wider windows) is a fourth candidate: the trees of a round-robin arbiter's ring-shaped
// priority chains in fewer LUTs and slices (the EPFL arbiter in the corpus's I/O wrapper 1224 -> 1010 slices, routed 1.5 %
// faster); on the corpus never kept (slower by the estimate)
export const DEPTH_ABC3 = DEPTH_ABC2.replace('if -g; strash; dc2; dch -f; if;', 'if -g; strash; dc2; dch -f; if -g; strash; dc2; dch -f; if -g; strash; dc2; dch -f; if;');
export const DEPTH_ABC_FILE = 'silinx_depth.abc';
// The fourth candidate's don't-care optimization (mfs2) on windows of up to 5000 nodes (#370; mfs2's own: 300): a
// round-robin arbiter's balanced chains share terms of its requests and priorities that reach further, the EPFL arbiter
// in the corpus's I/O wrapper 2019 -> 1537 LUTs at High, as deep, routed 0.9 % faster (ISE's trce); its area mapping made
// four more times (choices, mapping, mfs2: each shares more, the arbiter alone 1500 -> 1350 LUTs, as deep). Not on the
// candidates with the LUT delays (a wider window makes 5- and 6-input functions of 4-input ones, slower: a 48-request
// arbiter's third balancing 9.5 -> 9.9 ns estimated), nor on the GIA's SOP balancing (the arbiter at Normal routed 4 % slower)
export const MFS = 'mfs2 -M 5000';
export const DEPTH_ABC2_LUT4 = DEPTH_ABC2.replaceAll('mfs2', MFS) + `; strash; dch -f; if; ${MFS}`.repeat(4);
// The GIA's SOP balancing (#654): ABC's &sopb balances the logic as sums of products on its GIA form (the AIG with
// structural choices), then &if -g (the same balancing, delay-oriented, of a mapping onto 6-input cuts) and &synch2
// (choices again), twice, before a mapping onto LUT4s alone. Where if -g on the AIG (DEPTH_ABC…) keeps the
// structure of an arithmetic array written as gates, this restructures it: the EPFL multiplier (a 64 x 64-bit
// multiplier as an AIG, 87 levels of LUTs) 100.5 ns estimated -> 52.2 (45 levels) for 16 % more LUTs and slices, in
// 19 s (its usual run: 6 min); the EPFL max 66.0 -> 16.6 (DEPTH_ABC3: 23.0); the EPFL adder 98.2 -> 9.7, 8 levels of
// LUTs as ISE's (its carry chain: 17.4). A candidate of the designs whose usual netlist is more than `levels` levels
// deep, of `maxLuts` LUTs at most (SOPB_RULE), at both efforts, the multiplier's 7500 LUTs too (above
// DEPTH_RULE.maxLuts: it takes seconds where ABC's if -g takes minutes); research/synth-quality/README.md, "SOP
// balancing of the GIA".
export const DEPTH_SOPB = 'strash; &get -n; &sopb; &if -g -K 6; &synch2; &sopb; &if -g -K 6; &synch2; &if -K 4; &put; mfs2';
export const SOPB_RULE = { levels: 16, maxLuts: 20000 };
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
// takes minutes and gigabytes). Slices (#377), the device's own measure (a LUT and a flip-flop share a
// slice half; a MUXF5, a carry stage its LUTs'), when the netlists' are known (sliceCount): the same
// bounds on them too (a faster one's slices no more in proportion than it is faster, #54), and `area` fewer slices as smaller as `area` fewer LUTs (which are smaller only
// with no more slices), with at most `luts` more LUTs (the adder fixture's ABC9 netlist: 9 % fewer slices
// for 27 % more LUTs, refused)
// The mappings for speed (#652, #653): on designs of `maxLuts` LUTs at most; the clock enables folded those of the
// flip-flops whose CE ends a path `margin` ns from the critical one at most
export const SPEED_RULE = { maxLuts: 1500, margin: 0.05 };
// Optimization Effort Normal (#652): a design whose usual mapping has at most `maxLuts` LUTs is synthesized as at High too,
// that netlist kept when no slower than Normal's by the estimate (by ISE's trce High's netlists are 2.5 % faster on the
// designs of 500 LUTs at most, up to 19 %; itc99-b08's, 13 % slower by the estimate, 15 % by trce). The two syntheses take
// two to three times as long as Normal's one (blinky 2.0 -> 4.3 s, a design of 460 LUTs 5.5 -> 13 s), hence 250 LUTs: the
// designs that gain most are small (epfl-router, itc99-b10, b13, iwls05-sasc, the traffic example), as Place & Route makes
// two placements of a small design at Normal (#651)
export const SMALL_RULE = { maxLuts: 250, gain: 0 };
export const DEPTH_RULE = { gain: 0.03, luts: 0.1, maxLuts: 5000, area: 0.05, slack: 0.01 };
/** Is the depth-oriented mapping kept? ns, luts (and slices, when known): [usual, depth-oriented]. */
export function keepDepth(ns, luts, rule = DEPTH_RULE, slices = null) {
  const sl = slices && slices.every(Number.isFinite) ? slices : null;
  const grow = Math.max(rule.luts, 1 - ns[1] / ns[0]);
  // (faster with no more slices: `luts` more LUTs again, #54: verilog-uart's ABC9 netlist, 10 % faster, 4 % fewer slices,
  // 14 % more LUTs than the depth-oriented one with LUT6_MAP)
  const lutsOk = luts[1] <= luts[0] * (1 + grow + (sl && sl[1] <= sl[0] ? rule.luts : 0));
  // (its slices, the device's measure, no more in proportion than it is faster, #54: femtorv32-quark's third balancing
  // with LUT6_MAP, 3.7 % faster by the estimate, 8.8 % more slices, slower once routed)
  const faster = ns[1] <= ns[0] * (1 - rule.gain) && lutsOk && (!sl || sl[1] <= sl[0] * (2 - ns[1] / ns[0]));
  const better = ns[1] <= ns[0] && luts[1] <= luts[0] && (!sl || sl[1] <= sl[0])
    && (ns[1] < ns[0] || luts[1] < luts[0] || (sl && sl[1] < sl[0]));
  const fewer = n => n[1] < n[0] && n[1] <= n[0] * (1 - rule.area);
  const smaller = ns[1] <= ns[0] * (1 + rule.slack) && ((fewer(luts) && (!sl || sl[1] <= sl[0])) || (sl && fewer(sl) && luts[1] <= luts[0] * (1 + rule.luts)));
  return !!(faster || better || smaller);
}
/** Is the mapping balanced once more (DEPTH_ABC2) kept? ns, luts (slices): [usual, depth-oriented, balanced
 *  once more], the depth-oriented one kept: better than it (keepDepth), or faster than it (by the rule's
 *  gain) and kept by the rule against the usual mapping. */
export function keepSecond(ns, luts, rule = DEPTH_RULE, slices = null) {
  return keepDepth([ns[1], ns[2]], [luts[1], luts[2]], rule, slices && [slices[1], slices[2]])
    || (ns[2] <= ns[1] * (1 - rule.gain) && keepDepth([ns[0], ns[2]], [luts[0], luts[2]], rule, slices && [slices[0], slices[2]]));
}

/** Is the netlist with the carry chains written as gates (#77) kept? n, c: { ns, luts, slices } of the netlists without
 *  and with them; linesN, linesC: their runs' messages. Both ways (#742): the one without kept only when better than the
 *  one with them by DEPTH_RULE (kept unless the chains were, the EPFL adder's SOP-balanced netlist, 44 % faster by the
 *  estimate, 4 times its chains' LUTs and 74 % more slices, kept; routed 9 % faster). Never a netlist whose chains Yosys
 *  found driven twice, the usual run's not (the EPFL multiplier's rewrite, #746). The one without them kept too when
 *  faster by the rule's gain and larger (LUTs, slices) by no more times than it is faster (#746: the EPFL multiplier's,
 *  2.1 times faster by the estimate for 1.6 times the LUTs and slices, routed 2 times faster; the adder's, 1.8 times
 *  faster for 4 times the LUTs, not). */
export function keepChains(n, c, { linesN = [], linesC = [] } = {}, rule = DEPTH_RULE) {
  const conflicts = lines => lines.some(l => /^Warning: multiple conflicting drivers/.test(l));
  if (conflicts(linesC) && !conflicts(linesN)) return false;
  const k = c.ns / n.ns;
  const sl = Number.isFinite(n.slices) && Number.isFinite(c.slices);
  const times = n.ns <= c.ns * (1 - rule.gain) && n.luts <= c.luts * k && (!sl || n.slices <= c.slices * k);
  return !times && !keepDepth([c.ns, n.ns], [c.luts, n.luts], rule, [c.slices, n.slices]);
}

/** The slices of a mapped netlist of a 4-input-LUT family (Yosys's JSON), as core/fpga/pack.js packs them for
 *  the open flow; null when it does not pack (a cell it does not support yet). */
export function sliceCount(json, top) {
  try { return pack(readYosysJson(asText(json) || json, { top })).stats.slices; } catch { return null; }
}

/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again,
 *  with the depth-oriented ABC script (DEPTH_ABC, in the file DEPTH_ABC_FILE given to Yosys), onto LUT4_COSTS, the
 *  6-input functions split by LUT6_MAP (the file LUT6_MAP_FILE) where it can; luts: LUT4_ONLY onto LUT4s alone (#370). */
export function remapCommands(top, family, { script = true, inline = null, luts = LUT4_COSTS } = {}) {
  const synth = `synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`;
  const abc = inline ? ` -script ${abcInline(inline)}` : script ? ` -script ${DEPTH_ABC_FILE}` : '';
  return `read_rtlil ${PREMAP_FILE}; abc -luts ${luts}${abc}; ${lutsToCells(synth, { lut6: luts === LUT4_COSTS })}`;
}

/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again with ABC9 onto
 *  LUT4s alone: synth_xilinx's own map_luts step with -abc9 -nowidelut (ABC9's &if, Yosys's LUT delays), then the
 *  rest of synth_xilinx. A candidate of the 4-input-LUT families (#377): research/synth-quality/README.md, "ABC9"
 *  (#369: against the mapping onto LUT4s alone, 6 % more LUTs, 2.6 % fewer slices, a 2.7 % shorter period). */
export function abc9RemapCommands(top, family) {
  // (the cells' models first, with their parameters, and Silinx's SRL16E_1: the RTLIL has them as bare black boxes)
  return `read_verilog -lib -specify +/xilinx/cells_sim.v; read_verilog -lib +/xilinx/cells_xtra.v; read_verilog -lib ${SRL_CELLS_FILE}; read_rtlil -nooverwrite ${PREMAP_FILE}; `
    + `${ABC9_KEEP_CLOCKS}; synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top} -abc9 -nowidelut -run map_luts:; ${ABC9_UNKEEP_CLOCKS}`;
}
// The clock nets' names through ABC9 (#496): ABC9 makes every net a non-logic cell reads an output of its
// AIG, reintegrated as an alias ($abc$…$aiger$o…) of the net, and synth_xilinx's clean then keeps the alias's
// name and drops the net's ($iopadmap$clk, the usual mapping's: the timing report said "clock
// $abc$24199$aiger$o11"). The nets on the clock pins of the cells (the flip-flops' and latches' C, the shift
// registers', block RAMs' and multipliers' CLK / CLKA / CLKB, the distributed RAMs' WCLK, the DCMs' CLKIN) are
// marked keep before the mapping, which makes clean keep their names, and unmarked after it (no attribute in
// the netlist). (keep also lists the net among the AIG's outputs: ABC9 maps the same logic, the LUTs of a
// design may differ by a few.)
export const ABC9_KEEP_CLOCKS = 'select -set silinx_clocks t:* %ci1:+[C]:+[CLK]:+[CLKA]:+[CLKB]:+[WCLK]:+[CLKIN] w:* %i; setattr -set keep 1 @silinx_clocks';
export const ABC9_UNKEEP_CLOCKS = 'setattr -unset keep @silinx_clocks';

// $scopeinfo cells (kept hierarchy names) are not cells of the device: deleted before writing. The JSON has the
// top module alone (#86): synth_xilinx reads Yosys's whole Xilinx cell library as black boxes (430 modules of every
// family), which write_json wrote too: 9 MB for blinky instead of 0.3, and about 0.9 s of every run (its LUT
// mapping 0.15 s); every reader of the netlist takes its top module (core/fpga/netlist.js, sim-model.js,
// compiled-sim.js…). (write_verilog leaves the black boxes out by itself.) The top is selected by its attribute,
// not by its name, and is not a black box (#631): a top that ends empty is one (read_verilog marks a module with no
// body so: Yosys's ifdef_1, specify.v), which write_json -selected leaves out, and a name such as \1dff (an escaped
// identifier) is not the one select -module takes. (The library stays in the design: write_json takes the cells'
// port directions from it.)
export const TOP_ONLY = 'setattr -mod -unset blackbox =A:top; select =A:top';
export const outputs = top => `delete t:$scopeinfo; ${TOP_ONLY}; write_json -selected ${top}.json; select -clear; write_verilog -noattr ${top}_yosys.v; tee -q -o ${top}_stat.txt stat`;

// the netlist between the two runs of a design with carry chains written as gates (#77)
export const CHAIN_FILE = 'silinx_chains.json';
// the mapped netlist with its critical LUTs made shallower (#652, core/lut-resynth.js), read by Yosys to write the
// outputs (the Verilog netlist, the statistics) as of every other netlist; the cells' library for their ports
export const RESYNTH_FILE = 'silinx_resynth.json';
export const resynthCommands = top => `read_verilog -lib +/xilinx/cells_sim.v; read_verilog -lib +/xilinx/cells_xtra.v; read_verilog -lib ${SRL_CELLS_FILE}; read_json ${RESYNTH_FILE}; hierarchy -top ${top}; ${outputs(top)}`;
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
 * the depth-oriented one was kept, delays: { ns, luts, kept } of the same with the LUT delays (#78), third:
 * { ns, luts, kept } of the one balanced twice more with the LUT delays (DEPTH_ABC3, #52), lut4: { ns, luts, kept } of the
 * one balanced once more onto LUT4s alone (DEPTH_ABC2_LUT4 on LUT4_ONLY, #370), and
 * abc9: { ns, luts, kept } of ABC9's mapping onto LUT4s alone, kept when better than the netlist chosen (#377;
 * abc9: false leaves it out); each with its slices too, when it packs (sliceCount); muxf: { trees, ns, luts, slices,
 * kept } of the mapping with the wide multiplexers onto MUXF5 … MUXF7, when the usual run found some (#511), and sopb: { ns,
 * luts, slices, kept } of the mapping balanced as sums of products (DEPTH_SOPB, #654), made for a design deeper than
 * SOPB_RULE.levels at both efforts (at Normal kept by DEEP_RULE's gain too when the design gets none of High's mappings) }.
 * speed: { ns, luts, slices, kept } of the speedup's mapping (SPEED_ABC, #652), fold: { flipFlops, ns, luts, slices, kept } of
 * the mapping with the clock enables that end the critical path folded into D (#653), both from the netlist before the
 * LUT mapping, measured against the netlist chosen of the others, on both efforts (speed: false leaves them out); resynth:
 * { rounds, changed, ns, luts, slices, kept } of the netlist chosen of all of them with its critical LUTs made one level
 * shallower, their fan-out kept (#652, core/lut-resynth.js; resynth: false leaves it out).
 * effort ('high'): 'normal', the synthesis's Optimization Effort Normal (#282), is one Yosys run, the
 * usual mapping alone (beside it the quiet search for the state machines fsm_detect refuses for their users, #652; no
 * other mapping tried: as depth false; but the critical path's remaps, #652, and the mapping with the
 * wider functions, r.depth.wide, measured against the netlist chosen of the others, #54; wide: false leaves it out), but for a design limited by its depth (#468:
 * deepDesign, its levels in r.depth.levels; r.depth.auto true), which gets High's mappings too, kept when deepRule.gain
 * (DEEP_RULE's) faster than Normal's own netlist (#611: r.depth.normal { ns, luts, kept: Normal's own kept }, r.depth.high { ns, luts }
 * of High's then), for a small design (SMALL_RULE: its usual mapping of SMALL_RULE.maxLuts LUTs at most), synthesized as at
 * High too, High's netlist kept when smallRule.gain (0: no slower) faster by the estimate than Normal's (r.depth.small { luts: the
 * usual mapping's, ns: [Normal's, High's], kept }; smallRule: SMALL_RULE, for tests), and for a design
 * with wide multiplexers (#511: their mapping onto MUXF5 … MUXF7, r.depth.muxf, at both efforts); a design
 * written as gates also has its adders' carry chains recovered (#77, #377), the faster netlist kept. At High a
 * design whose state machines of FSM_RULE.states states or more the init values keep out of Yosys's fsm is
 * synthesized once more with them one-hot (#539, core/synth-fsm.js), and at both efforts a design whose machines of as many
 * states fsm_detect refuses for their users alone (#652), that netlist kept when better by DEPTH_RULE:
 * r.depth.fsm { machines: [{ wire, states }], ns, luts, slices, kept } (fsm: false leaves it out, 'always' keeps it). A design
 * whose usual run left memories written to in logic is synthesized once more with them as distributed RAM (#54, LUTRAM_COST),
 * High's mappings made from it (at Normal without them: its usual mapping and the one balanced onto LUT4s alone), its netlist
 * of fewest slices no slower than the one chosen kept: r.depth.lutram { memories, left (those still in logic), netlist (the
 * name of the candidate shown: usual, wide, depth, second, delays, third, lut4, abc9; null, the variant's own choice), ns,
 * luts, slices, kept } (lutram: false leaves it out).
 */
export async function synthesizeOpen(design, { family = 'spartan3e', run, onLine = () => {}, depth = true, effort = 'high', abc9: withAbc9 = true, deepRule = DEEP_RULE, smallRule = SMALL_RULE, fsm: withFsm = true, speed: withSpeed = true, wide = true, resynth: withResynth = true, lutram: withLutram = true } = {}) {
  const { text, top, warnings, shiftArrays = [] } = toVerilog(design);
  const lut4 = LUT4_FAMILIES.has(YOSYS_FAMILY[family]);
  const normal = effort === 'normal';
  const speed = withSpeed && depth && lut4;
  let tryDepth = !normal && depth && lut4;
  // (Normal: the design as it is before the LUT mapping written too, for High's mappings if it is deep)
  const opts = (tryDepth || (normal && depth && lut4)) ? { premap: PREMAP_FILE } : {};
  const log = [];
  const quiet = l => QUIET.some(re => re.test(l));
  const line = l => { if (!quiet(l)) { log.push(l); onLine(l); } };
  // the usual mapping's run; at Normal made first, and given (its messages again) to whichever step needs it
  // (at High started beside the search for state machines, #539: a promise, its messages said when it is taken)
  let usual = null;
  const usualRun = (say) => {
    if (usual) {
      const u = usual;
      usual = null;
      return Promise.resolve(u.done).then(out => { for (const l of u.lines) say(l); return out; }, e => { for (const l of u.lines) say(l); throw e; });
    }
    return run(['-q', '-p', yosysScript(top, family, opts)], yosysFiles(top, text), say);
  };
  // a design written as gates (#77): the first of its two runs, up to synth_xilinx's fine step (the coarse
  // netlist, its carry chains found there); at Normal started at once beside the usual run (#377)
  const gates = lut4 && gateAssignments(design) >= GATE_MIN;
  const lines1 = [];
  const coarse = () => run(['-q', '-p', `read_verilog -lib ${SRL_CELLS_FILE}; read_verilog -sv ${top}_syn.v; ${splitCommands(top, family, opts)[0]}; ${TOP_ONLY}; write_json -selected ${CHAIN_FILE}`],
    yosysFiles(top, text), l => { if (!quiet(l)) lines1.push(l); });
  const preRun = normal && gates ? coarse() : null;
  preRun?.catch(() => {});
  // High (#539): the state machines the init values keep out, found by a quiet run up to fsm (core/synth-fsm.js),
  // started at once, and, at both efforts, those fsm_detect refuses for their users alone, extracted by hand from its
  // netlist (#652); its failure leaves the design as it is
  const synth = `synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`;
  const linesP = [];
  const probe = depth && lut4 && withFsm
    ? run(['-q', '-p', fsmProbeCommands(`read_verilog -lib ${SRL_CELLS_FILE}; read_verilog -sv ${top}_syn.v; `, synth)], yosysFiles(top, text), l => { if (!quiet(l)) linesP.push(l); })
      .then(async out => {
        const pre = asText(out[FSM_PRE_FILE]);
        const forced = refusedForUsers(asText(out[FSM_DETECT_FILE]), top);
        // (the forced ones' codes from their own quiet run; when it fails, those of run 1 alone)
        const enc = forced.length
          ? await run(['-q', '-p', fsmForceCommands()], { [FSM_FORCED_FILE]: markWires(pre, forced, 'one-hot').il }, () => {})
            .then(o => asText(o[FSM_ENC_FILE]), () => null)
          : null;
        const all = enc === null ? fsmChosen(pre, asText(out[FSM_ENC_FILE])) : fsmChosen(pre, enc, undefined, forced);
        const machines = normal ? all.filter(m => forced.includes(m.wire)) : all;
        return { out, machines, forced: machines.map(m => m.wire).filter(w => forced.includes(w)) };
      }, () => null)
    : null;
  if (probe && !normal) {
    const lines = [];
    usual = { lines, done: run(['-q', '-p', yosysScript(top, family, opts)], yosysFiles(top, text), l => lines.push(l)) };
    usual.done.catch(() => {});
  }
  let deep = null;   // Normal: the usual mapping's levels of logic, and whether that is deep (#468)
  if (normal && depth && lut4) {
    const lines = [];
    const out = await run(['-q', '-p', yosysScript(top, family, opts)], yosysFiles(top, text), l => lines.push(l));
    usual = { done: out, lines };
    const json = out[`${top}.json`];
    if (json) deep = { levels: logicLevels(json, top), deep: deepDesign(json, top, deepRule) };
    if (deep?.deep) tryDepth = true;
    // (a small design: synthesized as at Normal and as at High, the faster by the estimate kept, High's when no slower,
    // its messages said, #652)
    const luts = json ? utilization(cellCounts(json, top)).luts : Infinity;
    if (!deep?.deep && luts <= smallRule.maxLuts) {
      const both = { family, run, depth, abc9: withAbc9, deepRule, fsm: withFsm, speed: withSpeed, wide, resynth: withResynth, lutram: withLutram };
      const linesN = [], linesH = [];
      // (side by side: Yosys runs in workers of their own)
      const [own, high] = await Promise.all([
        synthesizeOpen(design, { ...both, onLine: l => linesN.push(l), effort: 'normal', smallRule: { ...smallRule, maxLuts: -1 } }),
        synthesizeOpen(design, { ...both, onLine: l => linesH.push(l), effort: 'high' })]);
      const ns = [criticalDelay(own.files[`${top}.json`], top), criticalDelay(high.files[`${top}.json`], top)];
      const small = { luts, ns, kept: ns[1] <= ns[0] * (1 - (smallRule.gain ?? 0)) + 1e-9 };
      const pick = small.kept ? high : own;
      for (const l of small.kept ? linesH : linesN) onLine(l);
      return { ...pick, depth: { ...pick.depth, small } };
    }
  }
  const highMappings = !normal || !!deep?.deep;
  // a mapping (its run's output) and the depth-oriented ones, the faster kept (core/synth-open-depth.js)
  const { withDepth } = mountDepth({
    deepRule, depth, family, run, wide, withAbc9, withResynth, log, normal, quiet, speed, top, tryDepth: () => tryDepth
  });

  // a design with logic written as gates: its carry chains (adders, comparators: core/carry-chain.js, #77)
  // made $alu cells between two runs of Yosys (up to synth_xilinx's fine step, the netlist rewritten, then on
  // from it); mapped both with and without them, the faster kept (as the depth-oriented mapping: a chain of
  // a comparator that then combines several bits at once, EPFL max, is slower). A design without such a
  // chain is synthesized as before, in one run. At effort Normal only an adder's chains of ADDER_MIN bits at
  // least (with their sums: the EPFL adder, 98 ns as gates, 17 ns on the carry chain), the usual run at once
  // beside the first one (#377): a design without them costs no more time (the EPFL multiplier's chains,
  // slower, kept out by the rule: 13 s more beside its usual run's 300).
  // (with machines to try one-hot, the usual netlist's messages are said once the choice is made)
  const fsmFound = probe && await probe;
  const machines = fsmFound?.machines.length ? fsmFound.machines : null;
  const linesU = [];
  const emit = machines ? l => { if (!quiet(l)) linesU.push(l); } : line;
  let res = null, chains = [];
  if (lut4 && gates) {
    // (Normal, not deep: an adder's chains only, its first run started beside the usual one, #377)
    const adders = !highMappings;
    const [, rest] = splitCommands(top, family, opts);
    // (at Normal, not deep, the usual run's netlist when the first one fails)
    const pre = await (preRun || coarse()).catch(e => { if (adders) return {}; throw e; });
    const rw = pre[CHAIN_FILE] ? rewriteCarryChains(asText(pre[CHAIN_FILE]), { top, ...(adders && { adders: true, minChain: ADDER_MIN }) }) : { chains: [] };
    if (rw.chains.length) {
      const linesC = [], linesN = [];
      // (both at once, #86)
      const [resC, resN] = await Promise.all([
        run(['-q', '-p', `read_verilog -lib -specify +/xilinx/cells_sim.v; read_verilog -lib +/xilinx/cells_xtra.v; read_verilog -lib ${SRL_CELLS_FILE}; read_json ${CHAIN_FILE}; hierarchy -top ${top}; ${rest}; ${outputs(top)}`],
          { ...yosysFiles(top, text), [CHAIN_FILE]: JSON.stringify(rw.json) }, l => { if (!quiet(l)) linesC.push(l); }).then(outC => withDepth(outC, () => {}, linesC)),
        usualRun(l => { if (!quiet(l)) linesN.push(l); }).then(outN => withDepth(outN, () => {}, linesN)),
      ]);
      const measure = r => ({ ns: r.ns, luts: utilization(r.cells).luts, slices: r.slices() });
      const withChains = keepChains(measure(resN), measure(resC), { linesN, linesC });
      if (withChains) { chains = rw.chains; for (const l of [...lines1, ...linesC]) emit(l); res = resC; }
      else { for (const l of linesN) emit(l); res = resN; }
    }
  }
  if (!res) res = machines ? await withDepth(await usualRun(emit), () => {}, linesU) : await withDepth(await usualRun(line), line, [...log]);
  const memories = res.memories || 0;
  if (machines) {
    // the machines one-hot (#539): marked, extracted and re-encoded, their new power-up codes written back, the
    // rest of the script and High's mappings from that netlist; kept when better than the usual one by DEPTH_RULE
    const linesF = [...linesP];
    // (Yosys's warning on the machines marked by hand, #652, not said: the rule decides)
    const say = quietForced(l => { if (!quiet(l)) linesF.push(l); }, top, fsmFound.forced);
    let resF = null, failed = null;
    try {
      const { il } = markWires(asText(fsmFound.out[FSM_PRE_FILE]), machines.map(m => m.wire), 'one-hot');
      const out2 = await run(['-q', '-p', fsmExtractCommands()], { [FSM_MARKED_FILE]: il }, say);
      const inits = fsmInits(machines, asText(out2[FSM_ENC_FILE]));
      const cmds = synthCommands(top, family, opts), first = `${memorySteps(synth, memoryOpts(YOSYS_FAMILY[family], opts))}; `;
      if (inits && cmds.startsWith(first)) {
        const out3 = await run(['-q', '-p', `${fsmRestCommands(synth, cmds.slice(first.length))}; ${outputs(top)}`],
          { ...yosysFiles(top, text), [FSM_POST_FILE]: setInits(asText(out2[FSM_POST_FILE]), { ...inits, ...oldStateInits(machines, asText(out2[FSM_POST_FILE])) }) }, say);
        resF = await withDepth(out3, () => {}, linesF);
      }
    } catch (e) { failed = e.message; }
    const lutsOf = r => utilization(r.cells).luts;
    const kept = !!resF && (withFsm === 'always' || keepDepth([res.ns, resF.ns], [lutsOf(res), lutsOf(resF)], DEPTH_RULE, [res.slices(), resF.slices()]));
    const fsmInfo = { machines: machines.map(({ wire, states }) => ({ wire, states })), ns: resF?.ns ?? null, luts: resF ? lutsOf(resF) : null, slices: resF ? resF.slices() : null, kept };
    if (kept) { res = resF; chains = []; }
    for (const l of kept ? linesF : linesU) line(l);
    if (failed) {
      fsmInfo.failed = failed;
      line(`Warning: the one-hot encoding of the state machines failed (${failed}): the usual encoding is kept`);
    }
    res.info.fsm = fsmInfo;
  }
  if (withLutram && memories && (highMappings || (depth && lut4))) {
    // the memories as distributed RAM (#54, LUTRAM_COST), when the usual run left some to logic: the design synthesized
    // again so and, when that took some of them, High's mappings from its netlist (at Normal, a design that gets none
    // of them: its usual mapping and the one balanced onto LUT4s alone, High's smallest balancing, #370). A mapping for size: of its
    // netlists, those kept by DEPTH_RULE against the netlist chosen and no slower than it by the estimate (the rule's
    // slack), the one with the fewest slices; else its own choice, when better by DEPTH_RULE (the T80: the second
    // balancing chosen, 10 % faster by the estimate than the one onto LUT4s alone and 17 % more slices, routed
    // slower by trce, 21.10 ns against 20.36)
    const linesR = [];
    let resR = null, left = null, failed = null;
    try {
      const outR = await run(['-q', '-p', yosysScript(top, family, { ...opts, lutram: true })], yosysFiles(top, text), l => { if (!quiet(l)) linesR.push(l); });
      left = logicMemories(outR);
      if (left !== null && left < memories && highMappings) resR = await withDepth(outR, () => {}, linesR, { measured: true });
      else if (left !== null && left < memories) {
        const linesB = [];
        const outB = await run(['-q', '-p', `${remapCommands(top, family, { luts: LUT4_ONLY })}; ${outputs(top)}`], { [PREMAP_FILE]: asText(outR[PREMAP_FILE]), [DEPTH_ABC_FILE]: DEPTH_ABC2 },
          l => { if (!quiet(l)) linesB.push(l); });
        const measure = (name, o, lines) => {
          const j = o[`${top}.json`], c = cellCounts(j, top);
          return { name, out: o, lines, cells: c, ns: criticalDelay(j, top), luts: utilization(c).luts, slices: sliceCount(j, top) };
        };
        const pool = [measure('usual', outR, []), ...(outB[`${top}.json`] ? [measure('lut4', outB, linesB)] : [])];
        resR = { chosen: outR, cells: pool[0].cells, info: res.info, ns: pool[0].ns, slices: () => pool[0].slices, pool };
      }
    } catch (e) { failed = e.message; }
    const lutsOf = r => utilization(r.cells).luts;
    const keeps = c => keepDepth([res.ns, c.ns], [lutsOf(res), c.luts], DEPTH_RULE, [res.slices(), c.slices]);
    const own = resR && { name: null, out: resR.chosen, lines: [], cells: resR.cells, ns: resR.ns, luts: lutsOf(resR), slices: resR.slices() };
    const pick = !resR ? null : resR.pool.filter(c => Number.isFinite(c.slices) && c.ns <= res.ns * (1 + DEPTH_RULE.slack) && keeps(c))
      .sort((x, y) => x.slices - y.slices)[0] || (keeps(own) ? own : null);
    const shown = pick || own;
    const lutram = { memories, left, netlist: shown?.name ?? null, ns: shown?.ns ?? null, luts: shown?.luts ?? null, slices: shown?.slices ?? null, kept: !!pick };
    if (pick) {
      if (res.info.fsm) resR.info.fsm = res.info.fsm;
      res = { ...resR, chosen: pick.out, cells: pick.cells, ns: pick.ns, slices: () => pick.slices };
      chains = [];
      for (const l of [...linesR, ...pick.lines]) if (/^Warning:/.test(l) && !log.includes(l)) line(l);
    }
    if (failed) {
      lutram.failed = failed;
      line(`Warning: the memories as distributed RAM could not be mapped (${failed}): the netlist chosen before is kept`);
    }
    res.info.lutram = lutram;
  }
  const { chosen, cells, info } = res;
  if (deep) Object.assign(info, { levels: deep.levels, auto: deep.deep });
  const files = { [`${top}_syn.v`]: text, [`${top}.json`]: chosen[`${top}.json`], [`${top}_yosys.v`]: chosen[`${top}_yosys.v`] || '', [`${top}_stat.txt`]: chosen[`${top}_stat.txt`] || '' };
  // (a shift-chain array read at a variable tap is made flip-flops on purpose, then SRL16Es: Yosys's
  // "Replacing memory \m with list of registers" says nothing to the user there, #5)
  const expected = l => shiftArrays.some(n => l.startsWith(`Warning: Replacing memory ${n} with list of registers.`));
  const result = { top, files, cells, util: utilization(cells), warnings: [...warnings, ...log.filter(l => /^Warning:/.test(l) && !expected(l))], log, depth: info, chains };
  // (Normal, a deep design: High's mappings kept only when DEEP_RULE.gain faster than Normal's own netlist, #611;
  // else that one, its levels and the time High's took said)
  if (deep?.deep) {
    const plain = await synthesizeOpen(design, { family, run, depth: false, effort, abc9: withAbc9 });
    const ns = [criticalDelay(plain.files[`${top}.json`], top), criticalDelay(files[`${top}.json`], top)];
    info.normal = { ns: ns[0], luts: plain.util.luts, kept: !(ns[1] <= ns[0] * (1 - deepRule.gain)) };
    if (info.normal.kept) return { ...plain, depth: { ...plain.depth, levels: deep.levels, auto: true, high: { ns: ns[1], luts: result.util.luts }, normal: info.normal } };
  }
  return result;
}

