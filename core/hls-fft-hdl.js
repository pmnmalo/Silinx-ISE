// Silinx HLS (#1943): the hardware of hls_fft.h's hls::fft (core/hls-fft.js), its own HDL, VHDL or Verilog, suited to
// the Spartan-3E: the transform's values in a RAM of N words ({im, re}, written so that ISE and Yosys make it block
// RAMs), its twiddles a ROM (cos and sin of 3N/4 angles), four 18x18 multipliers (MULT18X18SIO, input_width + 2 bits
// by 16), a state machine around them, in place, as core/hls-fft.js computes:
//   the N inputs read from xn (a FIFO: an array's ap_fifo, or a stream) into the RAM;
//   each radix-4 stage, its groups one after the other: the four values read, the butterfly, each of its four outputs
//   twiddled (its products, then the sum rounded and truncated by 15 + the stage's scaling), rotated by a quarter turn
//   or truncated by the scaling, and written back in input_width bits (an overflow kept);
//   the N outputs written to xk, the RAM read in bit-reversed order (natural_order) or in its own; the overflow to
//   ovflo (a FIFO of one value, as Vitis HLS's ap_fifo of the bool pointer).
// The module is the top's: its ports Vitis HLS's for the call (ap_clk, ap_rst, ap_ctrl_hs, fwd_inv and scale_sch
// ap_none inputs, xn and xk ap_fifo ports of the complex values packed {im, re}, ovflo an ap_fifo output).
// Isomorphic ES module.
//
//   fftHdl(fft, { lang, module, src, params }) -> cToHdl's result
//     fft: core/cpp-fft.js's; params: the top's [{ name, w }] by the call's argument names (fwd_inv, scale_sch: a
//     parameter of the top or a constant; ovflo: the top's pointer)
import { fftTwiddles } from './hls-fft.js';
import { bin } from './c-hdl.js';
import { typeOf } from './c-types.js';

const clog2 = (n) => Math.max(1, (n - 1).toString(2).length);

/** The module's ports (the block protocol first), and the call's arguments the top's: { ports, dir, sch, ovflo }. */
function portsOf(fft, params) {
  const { p } = fft, W = 2 * p.inW;
  const P = [['ap_clk', 'in'], ['ap_rst', 'in'], ['ap_start', 'in'], ['ap_done', 'out'], ['ap_idle', 'out'], ['ap_ready', 'out']].map(([name, dir]) => ({ name, dir, w: 1 }));
  const bare = (k) => fft.names[k]?.replace(/^[&*]/, '');
  const top = (k) => params.find((x) => x.name === bare(k));
  const dir = top(2), sch = top(3), ovflo = fft.names[5] ? top(5) : null;
  if (dir) P.push({ name: dir.name, dir: 'in', w: dir.w, role: 'arg', param: dir.name });
  if (sch) P.push({ name: sch.name, dir: 'in', w: sch.w, role: 'arg', param: sch.name });
  const fields = (n) => [{ param: `${n}_ap_re`, off: 0, w: p.inW, k: 1, size: p.inW }, { param: `${n}_ap_im`, off: p.inW, w: p.inW, k: 1, size: p.inW }];
  const xn = fft.names[0], xk = fft.names[1];
  P.push({ name: `${xn}_dout`, dir: 'in', w: W, role: 'fifo', param: xn }, { name: `${xn}_empty_n`, dir: 'in', w: 1, role: 'fifo', param: xn }, { name: `${xn}_read`, dir: 'out', w: 1, role: 'fifo', param: xn });
  P.push({ name: `${xk}_din`, dir: 'out', w: W, role: 'fifo', param: xk }, { name: `${xk}_full_n`, dir: 'in', w: 1, role: 'fifo', param: xk }, { name: `${xk}_write`, dir: 'out', w: 1, role: 'fifo', param: xk });
  if (ovflo) P.push({ name: `${ovflo.name}_din`, dir: 'out', w: 1, role: 'fifo', param: ovflo.name }, { name: `${ovflo.name}_full_n`, dir: 'in', w: 1, role: 'fifo', param: ovflo.name }, { name: `${ovflo.name}_write`, dir: 'out', w: 1, role: 'fifo', param: ovflo.name });
  // (the C's values of the FIFOs: an array's from its memory, a stream's, the pointer's value)
  const from = (a) => (a.stream ? 'stream' : 'mem');
  const fifos = [{ name: xn, port: xn, dir: 'in', w: W, s: false, fields: fields(xn), from: from(fft.args.xn), n: p.N }, { name: xk, port: xk, dir: 'out', w: W, s: false, fields: fields(xk), from: from(fft.args.xk), n: p.N },
    ...(ovflo ? [{ name: ovflo.name, port: ovflo.name, dir: 'out', w: 1, s: false, from: 'ptr', param: ovflo.name }] : [])];
  // (fwd_inv and scale_sch not the top's: constants; not given: UG1399's defaults, inverse and the schedule all ones)
  const value = (k, def) => (fft.names[k] === undefined ? def : /^-?\d+$/.test(fft.names[k]) ? BigInt(fft.names[k]) : null);
  return { ports: P, dir, sch, ovflo, fifos, xn, xk, fwd: dir ? 0n : value(2, 0n), schedule: sch ? 0n : value(3, -1n) };
}

/** The top of a call of an hls::fft: the transform's hardware its module (no other statement in it; a float's refused).
 *  checked: core/c-check.js's; call: the top's statement. */
export function fftTop(checked, call, { file, lang, module, diagnostics }) {
  const fft = checked.ast.ffts.get(call.e.callee.name), f = checked.funcs.get(checked.top);
  const fail = (loc, message) => ({ ok: false, hdl: '', top: checked.top, ports: [], diagnostics: [...diagnostics, { file: loc.file || file, line: loc.line || 1, col: loc.col || 1, message, severity: 'error' }] });
  if (fft.p.float) return fail(fft.loc, `hls::fft<${fft.config}>: use_native_float: a floating-point FFT runs in the C simulation; its hardware is not made by Silinx HLS (#2309; Vitis HLS's synthesis of the corpus's such designs fails too)`);
  const other = f.body.items.find((st) => st !== call && !['pragma', 'empty'].includes(st.kind));
  if (other) return fail(other.loc || fft.loc, `hls::fft<${fft.config}>: the top holds the call alone (its hardware is the top's): move the other statements to another function`);
  const elem = (t) => typeOf(t.kind === 'ptr' ? t.to : t.kind === 'array' || t.kind === 'stream' ? t.of : t);
  const params = f.params.filter((pa) => !/^(struct)$/.test(pa.type.kind)).map((pa) => ({ name: pa.name, w: elem(pa.type)?.w ?? 1 }));
  // (xn and xk, complex values: their members' arguments, core/c-struct.js)
  for (const n of fft.names.slice(0, 2)) if (!params.some((x) => x.name === n) && f.params.some((pa) => pa.name === `${n}_ap_re`)) params.push({ name: n, w: 2 * fft.p.inW });
  const gen = fftHdl(fft, { lang, module: module || checked.top, src: file.split('/').pop(), params });
  return { ...gen, diagnostics: [...diagnostics, ...gen.diagnostics] };
}

export function fftHdl(fft, { lang = 'vhdl', module, src = 'input.cpp', params = [] }) {
  const { p } = fft;
  const io = portsOf(fft, params);
  const bad = !fft.names.slice(0, 2).every((n) => params.some((x) => x.name === n)) ? 'its xn and xk the top\'s arguments' : io.fwd === null ? 'its fwd_inv the top\'s argument or a constant' : io.schedule === null ? 'its scale_sch the top\'s argument or a constant'
    : fft.names[5] && !io.ovflo ? 'its ovflo the top\'s pointer' : null;
  if (bad) return { ok: false, hdl: '', top: module, ports: [], diagnostics: [{ file: fft.loc.file || src, line: fft.loc.line, col: fft.loc.col, severity: 'error', message: `hls::fft<${fft.config}>: ${bad}: its hardware is the top's` }] };
  const tw = fftTwiddles(p);
  const rn = (3 * p.N) / 4;
  const k = { ...p, io, aw: p.nfft, tw, rn, raw: clog2(rn), sw: clog2(p.stages), xw: p.inW + 2, pw: p.inW + 18 };
  const hdl = (lang === 'vhdl' ? vhdl : verilog)(module, src, io.ports, k);
  const report = { sequential: true, states: STATES.length, registerBits: 4 * 2 * p.inW + 2 * 2 * k.xw + 4 * k.pw + 4 * p.nfft + 32, loops: [],
    memories: [{ name: 'data', words: p.N, bits: 2 * p.inW, kind: 'RAM' }, { name: 'twiddles', words: rn, bits: 32, kind: 'ROM' }], fft: { points: p.N, stages: p.stages, width: p.inW } };
  return { ok: true, hdl, top: module, ports: io.ports, diagnostics: [], sequential: true, states: report.states, memories: [], fifos: io.fifos, report };
}

// the states: idle, the inputs, a group's reads, its butterfly, an output's twiddle (its ROM), products and write, the
// outputs' address and value, the overflow, done
const STATES = ['S_IDLE', 'S_IN', 'S_RD', 'S_BF', 'S_TW', 'S_MUL', 'S_WB', 'S_OA', 'S_OD', 'S_OV', 'S_DONE'];

// ------------------------------------------------------------------------------------------- Verilog
function verilog(name, src, ports, k) {
  const { io } = k, W = k.inW, X = k.xw, A = k.aw;
  const L = [`// Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): hls::fft, ${k.N} points, ${W} bits, pipelined_streaming_io: edit the C source`, `module ${name} (`];
  ports.forEach((q, i) => L.push(`  ${q.dir === 'in' ? 'input ' : 'output'} wire ${q.w > 1 ? `[${q.w - 1}:0] ` : ''}${q.name}${i < ports.length - 1 ? ',' : ''}`));
  L.push(');', ...STATES.map((s, i) => `  localparam ${s} = 4'd${i};`), '  reg [3:0] ap_st = S_IDLE;',
    `  reg [${2 * W - 1}:0] ap_ram [0:${k.N - 1}];`, `  reg [${2 * W - 1}:0] ap_q;`, `  reg [31:0] ap_rom [0:${k.rn - 1}];`, '  reg [31:0] ap_tw;',
    // (the transform's state: the direction and schedule taken at the start, the counters, the stage's quarter)
    "  reg ap_fwd, ap_ovf;", `  reg [${2 * k.stages - 1}:0] ap_sch;`, `  reg [${A}:0] ap_i;`, `  reg [${k.sw - 1}:0] ap_s;`,
    `  reg [${A - 1}:0] ap_k, ap_qt, ap_base;`, '  reg [2:0] ap_r;', '  reg [1:0] ap_j, ap_m;',
    `  reg signed [${W - 1}:0] ap_ar0, ap_ar1, ap_ar2, ap_ar3, ap_ai0, ap_ai1, ap_ai2, ap_ai3;`, `  reg signed [${X - 1}:0] ap_yr0, ap_yr1, ap_yr2, ap_yr3, ap_yi0, ap_yi1, ap_yi2, ap_yi3;`,
    `  reg signed [${X - 1}:0] ap_xr, ap_xi;`, `  reg signed [${k.pw - 1}:0] ap_p1, ap_p2, ap_p3, ap_p4;`,
    '  initial begin', ...Array.from({ length: k.rn }, (_, e) => `    ap_rom[${e}] = 32'b${bin(BigInt(k.tw.sin[e]), 16)}${bin(BigInt(k.tw.cos[e]), 16)};`), '  end');
  const sch = io.sch ? `${io.sch.name}` : `${2 * k.stages}'b${bin(io.schedule, 2 * k.stages)}`;
  // (an address of the group: base + k + j quarters; an output's: the butterfly's y0, y2, y1, y3 to the quarters 0, 1, 2, 3)
  L.push(`  wire [1:0] ap_sel = ap_st == S_RD ? ap_r[1:0] : {ap_j[0], ap_j[1]};`,
    `  wire [${A - 1}:0] ap_qo = ap_sel == 0 ? ${A}'d0 : ap_sel == 1 ? ap_qt : ap_sel == 2 ? ap_qt << 1 : (ap_qt << 1) + ap_qt;`,
    `  wire [${A - 1}:0] ap_addr = ap_st == S_IN ? ap_i[${A - 1}:0] : ap_st == S_OA || ap_st == S_OD ? ${k.natural ? `{${Array.from({ length: A }, (_, b) => `ap_i[${b}]`).join(', ')}}` : `ap_i[${A - 1}:0]`} : ap_base + ap_k + ap_qo;`,
    `  wire [${A + 1}:0] ap_kx = ap_k;`, `  wire [${A + 1}:0] ap_jk = ap_j == 0 ? ${A + 2}'d0 : ap_j == 1 ? ap_kx : ap_j == 2 ? ap_kx << 1 : (ap_kx << 1) + ap_kx;`, `  wire [${A - 1}:0] ap_nb = ap_base + {ap_qt, 2'b00};`, `  wire [${2 * W - 1}:0] ap_wd;`,
    "  wire ap_we = (ap_st == S_IN && " + `${io.xn}_empty_n) || ap_st == S_WB;`,
    '  always @(posedge ap_clk) begin', '    if (ap_we) ap_ram[ap_addr] <= ap_wd;', '    ap_q <= ap_ram[ap_addr];',
    `    ap_tw <= ap_rom[ap_jk << (2 * ap_s)];`, '  end');
  // (the butterfly, in full precision)
  const ext = (v) => `{{2{${v}[${W - 1}]}}, ${v}}`;
  L.push(`  wire signed [${X - 1}:0] ap_s0r = ${ext('ap_ar0')} + ${ext('ap_ar2')}, ap_s0i = ${ext('ap_ai0')} + ${ext('ap_ai2')}, ap_s1r = ${ext('ap_ar1')} + ${ext('ap_ar3')}, ap_s1i = ${ext('ap_ai1')} + ${ext('ap_ai3')};`,
    `  wire signed [${X - 1}:0] ap_d0r = ${ext('ap_ar0')} - ${ext('ap_ar2')}, ap_d0i = ${ext('ap_ai0')} - ${ext('ap_ai2')}, ap_d1r = ${ext('ap_ar1')} - ${ext('ap_ar3')}, ap_d1i = ${ext('ap_ai1')} - ${ext('ap_ai3')};`,
    `  wire signed [${X - 1}:0] ap_jr = ap_fwd ? ap_d1i : -ap_d1i, ap_ji = ap_fwd ? -ap_d1r : ap_d1r;`,
    // (the twiddle: wr cos, wi -sin forward)
    "  wire signed [15:0] ap_wr = ap_tw[15:0], ap_wi = ap_fwd ? -ap_tw[31:16] : ap_tw[31:16];",
    // (an output: twiddled, rounded at bit 10 and truncated by 15 + s; rotated; or truncated by s)
    `  wire signed [${k.pw}:0] ap_tr = ap_p1 - ap_p2 + 512, ap_ti = ap_p3 + ap_p4 + 512;`,
    `  wire [1:0] ap_sc = ap_sch >> (2 * ap_s);`,
    `  wire signed [${k.pw}:0] ap_or = ap_m == 2 ? ap_tr >>> (15 + ap_sc) : ap_m == 1 ? (ap_fwd ? ap_xi >>> ap_sc : (-ap_xi) >>> ap_sc) : ap_xr >>> ap_sc;`,
    `  wire signed [${k.pw}:0] ap_oi = ap_m == 2 ? ap_ti >>> (15 + ap_sc) : ap_m == 1 ? (ap_fwd ? (-ap_xr) >>> ap_sc : ap_xr >>> ap_sc) : ap_xi >>> ap_sc;`,
    `  wire ap_big = ap_or[${k.pw}:${W - 1}] != {${k.pw - W + 2}{ap_or[${W - 1}]}} || ap_oi[${k.pw}:${W - 1}] != {${k.pw - W + 2}{ap_oi[${W - 1}]}};`,
    `  assign ap_wd = ap_st == S_IN ? ${io.xn}_dout : {ap_oi[${W - 1}:0], ap_or[${W - 1}:0]};`,
    `  assign ${io.xn}_read = ap_st == S_IN;`, `  assign ${io.xk}_din = ap_q;`, `  assign ${io.xk}_write = ap_st == S_OD;`,
    ...(io.ovflo ? [`  assign ${io.ovflo.name}_din = ${k.ovflo ? 'ap_ovf' : "1'b0"};`, `  assign ${io.ovflo.name}_write = ap_st == S_OV;`] : []),
    '  assign ap_idle = ap_st == S_IDLE;', '  assign ap_done = ap_st == S_DONE;', '  assign ap_ready = ap_st == S_DONE;');
  L.push('  always @(posedge ap_clk) begin', '    if (ap_rst) ap_st <= S_IDLE;', '    else case (ap_st)',
    `      S_IDLE: if (ap_start) begin ap_fwd <= ${io.dir ? (io.dir.w === 1 ? io.dir.name : `${io.dir.name}[0]`) : `1'b${io.fwd ? 1 : 0}`}; ap_sch <= ${sch}; ap_ovf <= 1'b0; ap_i <= 0; ap_st <= S_IN; end`,
    `      S_IN: if (${io.xn}_empty_n) begin ap_i <= ap_i + 1'b1; if (ap_i == ${k.N - 1}) begin ap_s <= 0; ap_qt <= ${k.N / 4}; ap_base <= 0; ap_k <= 0; ap_r <= 0; ap_st <= S_RD; end end`,
    // (a group's four values: their addresses one a cycle, each value the cycle after)
    `      S_RD: begin ${[0, 1, 2, 3].map((n) => `if (ap_r == ${n + 1}) begin ap_ar${n} <= ap_q[${W - 1}:0]; ap_ai${n} <= ap_q[${2 * W - 1}:${W}]; end`).join(' ')} ap_r <= ap_r + 1'b1; if (ap_r == 4) ap_st <= S_BF; end`,
    '      S_BF: begin',
    '        ap_yr0 <= ap_s0r + ap_s1r; ap_yi0 <= ap_s0i + ap_s1i; ap_yr2 <= ap_s0r - ap_s1r; ap_yi2 <= ap_s0i - ap_s1i;',
    '        ap_yr1 <= ap_d0r + ap_jr; ap_yi1 <= ap_d0i + ap_ji; ap_yr3 <= ap_d0r - ap_jr; ap_yi3 <= ap_d0i - ap_ji;',
    "        ap_j <= 0; ap_st <= S_TW;", '      end',
    // (an output's kind: no twiddle (its k j 0, the last stage), a quarter turn (k j a quarter), a twiddle)
    `      S_TW: begin ap_xr <= ap_j == 0 ? ap_yr0 : ap_j == 1 ? ap_yr1 : ap_j == 2 ? ap_yr2 : ap_yr3; ap_xi <= ap_j == 0 ? ap_yi0 : ap_j == 1 ? ap_yi1 : ap_j == 2 ? ap_yi2 : ap_yi3; ap_m <= ap_qt == 1 || ap_jk == 0 ? 2'd0 : ap_jk == ap_qt ? 2'd1 : 2'd2; ap_st <= S_MUL; end`,
    '      S_MUL: begin ap_p1 <= ap_xr * ap_wr; ap_p2 <= ap_xi * ap_wi; ap_p3 <= ap_xr * ap_wi; ap_p4 <= ap_xi * ap_wr; ap_st <= S_WB; end',
    "      S_WB: begin if (ap_big) ap_ovf <= 1'b1; ap_j <= ap_j + 1'b1;",
    "        if (ap_j != 3) ap_st <= S_TW;",
    `        else if (ap_k != ap_qt - 1) begin ap_k <= ap_k + 1'b1; ap_r <= 0; ap_st <= S_RD; end`,
    `        else if (ap_nb != 0) begin ap_k <= 0; ap_base <= ap_nb; ap_r <= 0; ap_st <= S_RD; end`,
    `        else if (ap_s != ${k.stages - 1}) begin ap_s <= ap_s + 1'b1; ap_qt <= ap_qt >> 2; ap_k <= 0; ap_base <= 0; ap_r <= 0; ap_st <= S_RD; end`,
    '        else begin ap_i <= 0; ap_st <= S_OA; end', '      end',
    '      S_OA: ap_st <= S_OD;',
    `      S_OD: if (${io.xk}_full_n) begin ap_i <= ap_i + 1'b1; ap_st <= ap_i == ${k.N - 1} ? ${io.ovflo ? 'S_OV' : 'S_DONE'} : S_OA; end`,
    `      S_OV: if (${io.ovflo ? `${io.ovflo.name}_full_n` : "1'b1"}) ap_st <= S_DONE;`,
    '      S_DONE: ap_st <= S_IDLE;', '      default: ap_st <= S_IDLE;', '    endcase', '  end', 'endmodule', '');
  return L.join('\n');
}

// ------------------------------------------------------------------------------------------- VHDL
function vhdl(name, src, ports, k) {
  const { io } = k, W = k.inW, X = k.xw, A = k.aw, PW = k.pw + 1;
  const T = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
  const L = [`-- Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): hls::fft, ${k.N} points, ${W} bits, pipelined_streaming_io: edit the C source`,
    'library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '', `entity ${name} is`, '  port ('];
  ports.forEach((q, i) => L.push(`    ${q.name} : ${q.dir} ${T(q.w)}${i < ports.length - 1 ? ';' : ''}`));
  L.push('  );', `end ${name};`, '', `architecture behav of ${name} is`,
    `  type ap_st_t is (${STATES.join(', ')});`, '  signal ap_st : ap_st_t := S_IDLE;',
    `  type ap_ram_t is array (0 to ${k.N - 1}) of std_logic_vector(${2 * W - 1} downto 0);`, '  signal ap_ram : ap_ram_t;', `  signal ap_q, ap_wd : std_logic_vector(${2 * W - 1} downto 0);`,
    `  type ap_rom_t is array (0 to ${k.rn - 1}) of std_logic_vector(31 downto 0);`,
    `  constant ap_rom : ap_rom_t := (${Array.from({ length: k.rn }, (_, e) => `"${bin(BigInt(k.tw.sin[e]), 16)}${bin(BigInt(k.tw.cos[e]), 16)}"`).join(', ')});`,
    '  signal ap_tw : std_logic_vector(31 downto 0);', "  signal ap_fwd, ap_ovf, ap_we, ap_big : std_logic := '0';",
    `  signal ap_sch : unsigned(${2 * k.stages - 1} downto 0);`, `  signal ap_i : unsigned(${A} downto 0);`, `  signal ap_s : integer range 0 to ${k.stages - 1};`,
    `  signal ap_k, ap_qt, ap_qo, ap_base, ap_addr, ap_rev : unsigned(${A - 1} downto 0);`, '  signal ap_r : integer range 0 to 4;', '  signal ap_j, ap_m, ap_sel : integer range 0 to 3;',
    `  signal ap_jk, ap_kx : unsigned(${A + 1} downto 0);`, `  signal ap_rom_addr : unsigned(${A + 1} downto 0);`,
    `  signal ap_ar0, ap_ar1, ap_ar2, ap_ar3, ap_ai0, ap_ai1, ap_ai2, ap_ai3 : signed(${W - 1} downto 0);`,
    `  signal ap_yr0, ap_yr1, ap_yr2, ap_yr3, ap_yi0, ap_yi1, ap_yi2, ap_yi3 : signed(${X - 1} downto 0);`,
    `  signal ap_xr, ap_xi, ap_s0r, ap_s0i, ap_s1r, ap_s1i, ap_d0r, ap_d0i, ap_d1r, ap_d1i, ap_jr, ap_ji : signed(${X - 1} downto 0);`,
    `  signal ap_p1, ap_p2, ap_p3, ap_p4 : signed(${k.pw - 1} downto 0);`, `  signal ap_tr, ap_ti, ap_or, ap_oi : signed(${PW - 1} downto 0);`,
    '  signal ap_wr, ap_wi : signed(15 downto 0);', '  signal ap_sc : integer range 0 to 3;', 'begin');
  const R = (v) => `resize(${v}, ${X})`;
  const sch = io.sch ? (io.sch.w === 1 ? `resize(unsigned'(0 => ${io.sch.name}), ${2 * k.stages})` : `resize(unsigned(${io.sch.name}), ${2 * k.stages})`) : `"${bin(io.schedule, 2 * k.stages)}"`;
  L.push(`  ap_rev <= ${k.natural ? `(${Array.from({ length: A }, (_, b) => `${A - 1 - b} => ap_i(${b})`).join(', ')})` : `ap_i(${A - 1} downto 0)`};`,
    `  ap_sel <= ap_r mod 4 when ap_st = S_RD else (ap_j mod 2) * 2 + ap_j / 2;`,
    `  ap_qo <= (others => '0') when ap_sel = 0 else ap_qt when ap_sel = 1 else shift_left(ap_qt, 1) when ap_sel = 2 else shift_left(ap_qt, 1) + ap_qt;`,
    `  ap_addr <= ap_i(${A - 1} downto 0) when ap_st = S_IN else ap_rev when ap_st = S_OA or ap_st = S_OD else ap_base + ap_k + ap_qo;`,
    `  ap_kx <= resize(ap_k, ${A + 2});`, `  ap_jk <= (others => '0') when ap_j = 0 else ap_kx when ap_j = 1 else shift_left(ap_kx, 1) when ap_j = 2 else shift_left(ap_kx, 1) + ap_kx;`, `  ap_rom_addr <= shift_left(ap_jk, 2 * ap_s);`,
    `  ap_we <= '1' when (ap_st = S_IN and ${io.xn}_empty_n = '1') or ap_st = S_WB else '0';`,
    '  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then',
    "      if ap_we = '1' then ap_ram(to_integer(ap_addr)) <= ap_wd; end if;", '      ap_q <= ap_ram(to_integer(ap_addr));',
    `      if ap_rom_addr < ${k.rn} then ap_tw <= ap_rom(to_integer(ap_rom_addr)); else ap_tw <= (others => '0'); end if;`, '    end if;', '  end process;',
    `  ap_s0r <= ${R('ap_ar0')} + ${R('ap_ar2')};`, `  ap_s0i <= ${R('ap_ai0')} + ${R('ap_ai2')};`, `  ap_s1r <= ${R('ap_ar1')} + ${R('ap_ar3')};`, `  ap_s1i <= ${R('ap_ai1')} + ${R('ap_ai3')};`,
    `  ap_d0r <= ${R('ap_ar0')} - ${R('ap_ar2')};`, `  ap_d0i <= ${R('ap_ai0')} - ${R('ap_ai2')};`, `  ap_d1r <= ${R('ap_ar1')} - ${R('ap_ar3')};`, `  ap_d1i <= ${R('ap_ai1')} - ${R('ap_ai3')};`,
    "  ap_jr <= ap_d1i when ap_fwd = '1' else -ap_d1i;", "  ap_ji <= -ap_d1r when ap_fwd = '1' else ap_d1r;",
    '  ap_wr <= signed(ap_tw(15 downto 0));', "  ap_wi <= -signed(ap_tw(31 downto 16)) when ap_fwd = '1' else signed(ap_tw(31 downto 16));",
    `  ap_tr <= resize(ap_p1, ${PW}) - resize(ap_p2, ${PW}) + 512;`, `  ap_ti <= resize(ap_p3, ${PW}) + resize(ap_p4, ${PW}) + 512;`,
    `  ap_sc <= to_integer(ap_sch(2 * ap_s + 1 downto 2 * ap_s));`,
    `  ap_or <= shift_right(ap_tr, 15 + ap_sc) when ap_m = 2 else shift_right(resize(ap_xi, ${PW}), ap_sc) when ap_m = 1 and ap_fwd = '1' else shift_right(-resize(ap_xi, ${PW}), ap_sc) when ap_m = 1 else shift_right(resize(ap_xr, ${PW}), ap_sc);`,
    `  ap_oi <= shift_right(ap_ti, 15 + ap_sc) when ap_m = 2 else shift_right(-resize(ap_xr, ${PW}), ap_sc) when ap_m = 1 and ap_fwd = '1' else shift_right(resize(ap_xr, ${PW}), ap_sc) when ap_m = 1 else shift_right(resize(ap_xi, ${PW}), ap_sc);`,
    `  ap_big <= '1' when resize(ap_or(${W - 1} downto 0), ${PW}) /= ap_or or resize(ap_oi(${W - 1} downto 0), ${PW}) /= ap_oi else '0';`,
    `  ap_wd <= ${io.xn}_dout when ap_st = S_IN else std_logic_vector(ap_oi(${W - 1} downto 0)) & std_logic_vector(ap_or(${W - 1} downto 0));`,
    `  ${io.xn}_read <= '1' when ap_st = S_IN else '0';`, `  ${io.xk}_din <= ap_q;`, `  ${io.xk}_write <= '1' when ap_st = S_OD else '0';`,
    ...(io.ovflo ? [`  ${io.ovflo.name}_din <= ${k.ovflo ? 'ap_ovf' : "'0'"};`, `  ${io.ovflo.name}_write <= '1' when ap_st = S_OV else '0';`] : []),
    "  ap_idle <= '1' when ap_st = S_IDLE else '0';", "  ap_done <= '1' when ap_st = S_DONE else '0';", "  ap_ready <= '1' when ap_st = S_DONE else '0';");
  const fwd = io.dir ? (io.dir.w === 1 ? io.dir.name : `${io.dir.name}(0)`) : `'${io.fwd ? 1 : 0}'`;
  const next = ["            ap_k <= (others => '0'); ap_r <= 0; ap_st <= S_RD;"];
  L.push('  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', "      if ap_rst = '1' then", '        ap_st <= S_IDLE;', '      else', '        case ap_st is',
    "          when S_IDLE =>", "            if ap_start = '1' then", `              ap_fwd <= ${fwd}; ap_sch <= ${sch}; ap_ovf <= '0'; ap_i <= (others => '0'); ap_st <= S_IN;`, '            end if;',
    '          when S_IN =>', `            if ${io.xn}_empty_n = '1' then`, '              ap_i <= ap_i + 1;', `              if ap_i = ${k.N - 1} then`,
    `                ap_s <= 0; ap_qt <= to_unsigned(${k.N / 4}, ${A}); ap_base <= (others => '0'); ap_k <= (others => '0'); ap_r <= 0; ap_st <= S_RD;`, '              end if;', '            end if;',
    '          when S_RD =>', ...[0, 1, 2, 3].map((n) => `            if ap_r = ${n + 1} then ap_ar${n} <= signed(ap_q(${W - 1} downto 0)); ap_ai${n} <= signed(ap_q(${2 * W - 1} downto ${W})); end if;`),
    '            if ap_r = 4 then ap_st <= S_BF; else ap_r <= ap_r + 1; end if;',
    '          when S_BF =>', '            ap_yr0 <= ap_s0r + ap_s1r; ap_yi0 <= ap_s0i + ap_s1i; ap_yr2 <= ap_s0r - ap_s1r; ap_yi2 <= ap_s0i - ap_s1i;',
    '            ap_yr1 <= ap_d0r + ap_jr; ap_yi1 <= ap_d0i + ap_ji; ap_yr3 <= ap_d0r - ap_jr; ap_yi3 <= ap_d0i - ap_ji;', '            ap_j <= 0; ap_st <= S_TW;',
    '          when S_TW =>', '            case ap_j is', '              when 0 => ap_xr <= ap_yr0; ap_xi <= ap_yi0;', '              when 1 => ap_xr <= ap_yr1; ap_xi <= ap_yi1;', '              when 2 => ap_xr <= ap_yr2; ap_xi <= ap_yi2;', '              when others => ap_xr <= ap_yr3; ap_xi <= ap_yi3;', '            end case;',
    '            if ap_qt = 1 or ap_jk = 0 then ap_m <= 0; elsif ap_jk = resize(ap_qt, ap_jk\'length) then ap_m <= 1; else ap_m <= 2; end if;', '            ap_st <= S_MUL;',
    '          when S_MUL =>', `            ap_p1 <= resize(ap_xr * ap_wr, ${k.pw}); ap_p2 <= resize(ap_xi * ap_wi, ${k.pw}); ap_p3 <= resize(ap_xr * ap_wi, ${k.pw}); ap_p4 <= resize(ap_xi * ap_wr, ${k.pw});`, '            ap_st <= S_WB;',
    '          when S_WB =>', "            if ap_big = '1' then ap_ovf <= '1'; end if;",
    '            if ap_j /= 3 then', '              ap_j <= ap_j + 1; ap_st <= S_TW;',
    '            elsif ap_k /= ap_qt - 1 then', "              ap_k <= ap_k + 1; ap_r <= 0; ap_st <= S_RD;",
    `            elsif resize(ap_base + shift_left(ap_qt, 2), ${A}) /= 0 then`, `              ap_base <= resize(ap_base + shift_left(ap_qt, 2), ${A});`, ...next,
    `            elsif ap_s /= ${k.stages - 1} then`, "              ap_s <= ap_s + 1; ap_qt <= shift_right(ap_qt, 2); ap_base <= (others => '0');", `  ${next[0]}`,
    '            else', "              ap_i <= (others => '0'); ap_st <= S_OA;", '            end if;',
    '          when S_OA =>', '            ap_st <= S_OD;',
    '          when S_OD =>', `            if ${io.xk}_full_n = '1' then`, '              ap_i <= ap_i + 1;', `              if ap_i = ${k.N - 1} then ap_st <= ${io.ovflo ? 'S_OV' : 'S_DONE'}; else ap_st <= S_OA; end if;`, '            end if;',
    '          when S_OV =>', `            if ${io.ovflo ? `${io.ovflo.name}_full_n = '1'` : 'true'} then ap_st <= S_DONE; end if;`,
    '          when S_DONE =>', '            ap_st <= S_IDLE;', '        end case;', '      end if;', '    end if;', '  end process;', 'end behav;', '');
  return L.join('\n');
}
