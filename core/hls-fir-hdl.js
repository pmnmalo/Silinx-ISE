// Silinx HLS (#1942): the hardware of hls_fir.h's hls::FIR (core/hls-fir.js), its own HDL, VHDL or Verilog, suited to
// the Spartan-3E: one multiply-accumulate (the multiplier's operands and product registered, an 18x18 multiplier's,
// MULT18X18SIO, for widths up to 18), the coefficients a ROM and the delay line a RAM (written so that ISE and Yosys
// make them block RAMs), a state machine around them:
//   each input read (an array's: its address, its value the cycle after; a stream's: when it has one) and written
//   into the delay line (a circular buffer, the input converted to the parameters' format);
//   once each decim_rate inputs (decimation), or each input interp_rate times (interpolation, a phase each), the
//   taps multiplied and accumulated one a cycle, in full precision;
//   the sum written out (converted to the output's type, as the C model's ap_fixed conversion).
// The module's ports Vitis HLS's for the filter's run(): ap_clk, ap_rst, ap_ctrl_hs, an array's ap_memory with its two
// ports (the second unused, as the filter's), a stream's ap_fifo, the config an ap_none input (or a stream).
// Isomorphic ES module.
//
//   firHdl(fir, { lang, module, src, types: { in, out, config } }) -> cToHdl's result for a process (core/c-processes.js)
//     fir: core/cpp-fir.js's (its parameters p and its arguments' kinds); types: the arguments' element types
//     (core/c-types.js's typeOf)
import { Flow } from './c-dataflow.js';
import { sig, vhdlNodes, verilogNodes, bin } from './c-hdl.js';
import { portOf } from './c-names.js';
import { fixedType } from './c-fixed.js';
import { firPhases } from './hls-fir.js';

const clog2 = (n) => Math.max(1, (n - 1).toString(2).length);

/** The ports of the filter's module: [{ name, dir, w, role, param }] (the block protocol first). */
function portsOf(fir, types, aw) {
  const P = [['ap_clk', 'in'], ['ap_rst', 'in'], ['ap_start', 'in'], ['ap_done', 'out'], ['ap_idle', 'out'], ['ap_ready', 'out']].map(([name, dir]) => ({ name, dir, w: 1 }));
  for (const param of ['in', 'out', 'config']) {
    const a = fir.args[param];
    if (!a) continue;
    const n = portOf(param), w = types[param].w;
    // (unused: the ports the filter never drives but to 0 nor reads, Vitis HLS's: an input array's write, an output's
    // read, the second port; a local array's buffer leaves them out, core/c-processes.js)
    const port = (sfx, dir, pw, role) => P.push({ name: `${n}_${sfx}`, dir, w: pw, role, param, ...(role === 'mem' && (/1$/.test(sfx) || (param === 'in' ? /^(d|we)0$/ : /^q0$/).test(sfx)) ? { unused: true } : {}) });
    if (a.stream && param === 'out') { port('din', 'out', w, 'fifo'); port('full_n', 'in', 1, 'fifo'); port('write', 'out', 1, 'fifo'); }
    else if (a.stream) { port('dout', 'in', w, 'fifo'); port('empty_n', 'in', 1, 'fifo'); port('read', 'out', 1, 'fifo'); }
    else if (param === 'config') P.push({ name: n, dir: 'in', w, role: 'arg', param });
    else for (const k of [0, 1]) { port(`address${k}`, 'out', aw[param], 'mem'); port(`ce${k}`, 'out', 1, 'mem'); port(`d${k}`, 'out', w, 'mem'); port(`q${k}`, 'in', w, 'mem'); port(`we${k}`, 'out', 1, 'mem'); }
  }
  return P;
}

/** The conversions, one graph (core/c-graph.js): an input to the delay line's format, the sum to the output's type. */
function conversions(p, types, xin) {
  const f = new Flow({ ast: { file: '' } });
  const accT = fixedType(p.accW, p.accW - p.accF, true);
  const x = f.conv(f.v(f.g.add('in', [], { w: types.in.w, s: types.in.s }, { port: { name: xin, key: 'x' } }), types.in), fixedType(p.inW, p.inW - p.inF, true));
  let y = f.v(f.g.add('in', [], { w: p.accW, s: true }, { port: { name: 'ap_acc_v', key: 'acc' } }), accT);
  if (p.outW < p.accW) y = f.conv(y, fixedType(p.outW, p.outW - p.outF, true));   // (truncate_lsbs)
  y = f.conv(y, types.out);
  return { g: f.g, nodes: f.g.needed([x.id, y.id]), x: f.g.get(x.id), y: f.g.get(y.id) };
}

export function firHdl(fir, { lang = 'vhdl', module, src = 'input.cpp', types }) {
  const { p } = fir;
  const aw = { in: clog2(p.inLen), out: clog2(p.outLen) };
  const ports = portsOf(fir, types, aw);
  const rom = firPhases(p);
  const raw = clog2(rom.length + 1);
  const n = { in: portOf('in'), out: portOf('out'), config: portOf('config') };
  const sIn = fir.args.in.stream, sOut = fir.args.out.stream, cfg = fir.args.config;
  const cv = conversions(p, types, sIn ? `${n.in}_dout` : `${n.in}_q0`);
  const k = { ...p, aw, raw, rn: 2 ** raw, rom, n, sIn, sOut, cfg, cv, types, lnt: p.L * p.nt, pw: p.inW + p.cW };
  const hdl = (lang === 'vhdl' ? vhdl : verilog)(module, src, ports, k);
  const memories = ['in', 'out'].filter((a) => !fir.args[a].stream).map((a) => ({ name: a, n: a === 'in' ? p.inLen : p.outLen, w: types[a].w, s: types[a].s, aw: aw[a], read: a === 'in', written: a === 'out' }));
  const fifos = ['in', 'out', 'config'].filter((a) => fir.args[a]?.stream).map((a) => ({ name: a, dir: a === 'out' ? 'out' : 'in', w: types[a].w, s: types[a].s }));
  // (the registers: the state, the counters, the bases, the operands, the product, the sum, the pipeline's valid bits)
  const regs = 3 + clog2(p.inLen + 1) + clog2(p.outLen + 1) + 2 + 3 * clog2(p.nt + 1) + clog2(p.D) + clog2(p.L) + 2 * raw + p.inW + p.cW + k.pw + p.accW + 2;
  const report = { sequential: true, states: cfg?.stream ? 7 : 6, registerBits: regs, memories: [{ name: 'coefficients', words: rom.length, bits: p.cW, kind: 'ROM' }, { name: 'delay line', words: p.nt, bits: p.inW, kind: 'RAM' }], loops: [], fir: { taps: p.taps, sets: p.sets, accW: p.accW, outW: p.outW } };
  return { ok: true, hdl, top: module, ports, diagnostics: [], sequential: true, states: report.states, memories, fifos, report };
}

// ------------------------------------------------------------------------------------------- VHDL
function vhdl(name, src, ports, k) {
  const { n, cv } = k;
  const T = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
  const iw = clog2(k.inLen + 1) + 1, ow = clog2(k.outLen + 1) + 1;
  const L = [`-- Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): hls::FIR, ${k.type}, ${k.taps} taps${k.sets > 1 ? ` x ${k.sets} sets` : ''}: edit the C source`,
    'library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '', `entity ${name} is`, '  port ('];
  ports.forEach((q, i) => L.push(`    ${q.name} : ${q.dir} ${T(q.w)}${i < ports.length - 1 ? ';' : ''}`));
  L.push('  );', `end ${name};`, '', `architecture behav of ${name} is`,
    '  type ap_st_t is (S_IDLE, S_CFG, S_RD, S_WR, S_MAC, S_OUT, S_DONE);', '  signal ap_st : ap_st_t := S_IDLE;',
    `  signal ap_i : unsigned(${iw - 1} downto 0);`, `  signal ap_o : unsigned(${ow - 1} downto 0);`,
    `  signal ap_k : integer range 0 to ${k.nt};`, `  signal ap_wp, ap_nw : integer range 0 to ${k.nt - 1} := 0;`,
    `  signal ap_dc : integer range 0 to ${k.D - 1};`, `  signal ap_ph : integer range 0 to ${k.L - 1};`,
    `  signal ap_base, ap_sbase, ap_rom_addr : unsigned(${k.raw - 1} downto 0);`,
    // (the coefficients: a block ROM; the delay line: a block RAM, zeros at the start as the C model's statics)
    `  type ap_rom_t is array (0 to ${k.rn - 1}) of signed(${k.cW - 1} downto 0);`,
    `  constant ap_rom : ap_rom_t := (${Array.from({ length: k.rn }, (_, j) => `${j} => "${bin(k.rom[j] ?? 0n, k.cW)}"`).join(', ')});`,
    `  type ap_dl_t is array (0 to ${k.nt - 1}) of signed(${k.inW - 1} downto 0);`, '  signal ap_dl : ap_dl_t := (others => (others => \'0\'));',
    `  signal ap_dl_addr : integer range 0 to ${k.nt - 1};`, '  signal ap_dl_we, ap_take, ap_give, ap_v1, ap_v2 : std_logic;',
    `  signal ap_dl_q : signed(${k.inW - 1} downto 0);`, `  signal ap_rom_q : signed(${k.cW - 1} downto 0);`,
    `  signal ap_prod : signed(${k.pw - 1} downto 0);`, `  signal ap_acc : signed(${k.accW - 1} downto 0);`, `  signal ap_acc_v : std_logic_vector(${k.accW - 1} downto 0);`,
    // (the addresses and the config as unsigned, a port of one bit too)
    `  signal ap_in_addr : unsigned(${k.aw.in - 1} downto 0);`, `  signal ap_out_addr : unsigned(${k.aw.out - 1} downto 0);`, `  signal ap_cfg : unsigned(${k.cfg ? k.types.config.w - 1 : 0} downto 0);`);
  for (const x of cv.nodes) L.push(`  signal ${sig(x)} : ${x.s ? 'signed' : 'unsigned'}(${x.w - 1} downto 0);`);
  L.push('begin');
  vhdlNodes(cv.nodes, cv.g, L);
  const zero = (w) => (w === 1 ? "'0'" : "(others => '0')");
  const vec = (x, w) => (w === 1 ? `${x}(0)` : `std_logic_vector(${x})`);
  const slv = (x, w) => (w === 1 ? `${sig(x)}(0)` : `std_logic_vector(${sig(x)})`);
  // (an input taken: an array's value the cycle after its address, a stream's when it has one; an output given)
  L.push(k.sIn ? `  ap_take <= '1' when ap_st = S_RD and ${n.in}_empty_n = '1' else '0';` : "  ap_take <= '1' when ap_st = S_WR else '0';",
    k.sOut ? `  ap_give <= '1' when ap_st = S_OUT and ${n.out}_full_n = '1' else '0';` : "  ap_give <= '1' when ap_st = S_OUT else '0';",
    '  ap_dl_we <= ap_take;', `  ap_dl_addr <= ap_wp when ap_take = '1' else ap_nw - ap_k when ap_nw >= ap_k else ap_nw + ${k.nt} - ap_k;`,
    `  ap_rom_addr <= ap_base + to_unsigned(ap_k, ${k.raw});`, '  ap_acc_v <= std_logic_vector(ap_acc);');
  if (k.sIn) L.push(`  ${n.in}_read <= ap_take;`);
  else {
    L.push(`  ap_in_addr <= ap_i(${k.aw.in - 1} downto 0) + 1 when ap_st = S_WR else ap_i(${k.aw.in - 1} downto 0);`, `  ${n.in}_address0 <= ${vec('ap_in_addr', k.aw.in)};`,
      `  ${n.in}_ce0 <= '1' when ap_st = S_RD or (ap_st = S_WR and ap_dc /= ${k.D - 1}) else '0';`,
      `  ${n.in}_d0 <= ${zero(k.types.in.w)};`, `  ${n.in}_we0 <= '0';`, `  ${n.in}_address1 <= ${zero(k.aw.in)};`, `  ${n.in}_ce1 <= '0';`,
      `  ${n.in}_d1 <= ${zero(k.types.in.w)};`, `  ${n.in}_we1 <= '0';`);
  }
  if (k.sOut) L.push(`  ${n.out}_din <= ${slv(cv.y, k.types.out.w)};`, `  ${n.out}_write <= ap_give;`);
  else {
    L.push(`  ap_out_addr <= ap_o(${k.aw.out - 1} downto 0);`, `  ${n.out}_address0 <= ${vec('ap_out_addr', k.aw.out)};`, `  ${n.out}_ce0 <= ap_give;`, `  ${n.out}_we0 <= ap_give;`, `  ${n.out}_d0 <= ${slv(cv.y, k.types.out.w)};`,
      `  ${n.out}_address1 <= ${zero(k.aw.out)};`, `  ${n.out}_ce1 <= '0';`, `  ${n.out}_d1 <= ${zero(k.types.out.w)};`, `  ${n.out}_we1 <= '0';`);
  }
  if (k.cfg?.stream) L.push(`  ${n.config}_read <= '1' when ap_st = S_CFG and ${n.config}_empty_n = '1' else '0';`);
  const cfgIn = k.cfg?.stream ? `${n.config}_dout` : n.config;
  L.push(k.cfg ? (k.types.config.w === 1 ? `  ap_cfg(0) <= ${cfgIn};` : `  ap_cfg <= unsigned(${cfgIn});`) : "  ap_cfg <= \"0\";");
  L.push("  ap_idle <= '1' when ap_st = S_IDLE else '0';", "  ap_done <= '1' when ap_st = S_DONE else '0';", "  ap_ready <= '1' when ap_st = S_DONE else '0';");
  L.push('  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', '      ap_rom_q <= ap_rom(to_integer(ap_rom_addr));',
    "      if ap_dl_we = '1' then", `        ap_dl(ap_dl_addr) <= ${sig(cv.x)};`, '      end if;', '      ap_dl_q <= ap_dl(ap_dl_addr);', '    end if;', '  end process;');
  // (the set's first coefficient: the config's set times its phases' taps; one set, the first)
  const sbase = k.sets > 1 ? `resize(ap_cfg * to_unsigned(${k.lnt}, ${k.raw}), ${k.raw})` : `to_unsigned(0, ${k.raw})`;
  const sample = ['            ap_nw <= ap_wp;', `            if ap_wp = ${k.nt - 1} then ap_wp <= 0; else ap_wp <= ap_wp + 1; end if;`, '            ap_i <= ap_i + 1;',
    `            if ap_dc = ${k.D - 1} then`, "              ap_dc <= 0; ap_ph <= 0; ap_base <= ap_sbase; ap_k <= 0; ap_acc <= (others => '0'); ap_st <= S_MAC;", '            else', '              ap_dc <= ap_dc + 1;', '            end if;'];
  L.push('  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', "      if ap_rst = '1' then", '        ap_st <= S_IDLE; ap_wp <= 0; ap_nw <= 0;', "        ap_v1 <= '0'; ap_v2 <= '0';", '      else',
    "        ap_v1 <= '0';", '        ap_v2 <= ap_v1;', "        if ap_v1 = '1' then ap_prod <= ap_dl_q * ap_rom_q; end if;", `        if ap_v2 = '1' then ap_acc <= ap_acc + resize(ap_prod, ${k.accW}); end if;`,
    '        case ap_st is', '          when S_IDLE =>', "            if ap_start = '1' then", "              ap_i <= (others => '0'); ap_o <= (others => '0'); ap_dc <= 0;",
    ...(k.cfg?.stream ? [] : [`              ap_sbase <= ${sbase};`]),
    `              ap_st <= ${k.cfg?.stream ? 'S_CFG' : 'S_RD'};`, '            end if;',
    '          when S_CFG =>', ...(k.cfg?.stream ? [`            if ${n.config}_empty_n = '1' then`, `              ap_sbase <= ${sbase};`, '              ap_st <= S_RD;', '            end if;'] : ['            ap_st <= S_RD;']),
    '          when S_RD =>', ...(k.sIn ? ["            if ap_take = '1' then", ...sample.map((s) => `  ${s}`), '            end if;'] : ['            ap_st <= S_WR;']),
    '          when S_WR =>', ...sample,
    '          when S_MAC =>', `            if ap_k < ${k.nt} then`, "              ap_v1 <= '1'; ap_k <= ap_k + 1;", "            elsif ap_v1 = '0' then", '              ap_st <= S_OUT;', '            end if;',
    '          when S_OUT =>', "            if ap_give = '1' then", '              ap_o <= ap_o + 1;', `              if ap_ph < ${k.L - 1} then`,
    `                ap_ph <= ap_ph + 1; ap_base <= ap_base + ${k.nt}; ap_k <= 0; ap_acc <= (others => '0'); ap_st <= S_MAC;`,
    `              elsif ap_i = ${k.inLen} then`, '                ap_st <= S_DONE;', '              else', '                ap_st <= S_RD;', '              end if;', '            end if;',
    '          when S_DONE =>', '            ap_st <= S_IDLE;', '        end case;', '      end if;', '    end if;', '  end process;', 'end behav;', '');
  return L.join('\n');
}

// ------------------------------------------------------------------------------------------- Verilog
function verilog(name, src, ports, k) {
  const { n, cv } = k;
  const W = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const iw = clog2(k.inLen + 1) + 1, ow = clog2(k.outLen + 1) + 1, cw = clog2(k.nt + 1);
  const S = { S_IDLE: 0, S_CFG: 1, S_RD: 2, S_WR: 3, S_MAC: 4, S_OUT: 5, S_DONE: 6 };
  const L = [`// Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): hls::FIR, ${k.type}, ${k.taps} taps${k.sets > 1 ? ` x ${k.sets} sets` : ''}: edit the C source`, `module ${name} (`];
  ports.forEach((q, i) => L.push(`  ${q.dir === 'in' ? 'input ' : 'output'} wire ${W(q.w)}${q.name}${i < ports.length - 1 ? ',' : ''}`));
  L.push(');', ...Object.entries(S).map(([s, v]) => `  localparam ${s} = 3'd${v};`), '  reg [2:0] ap_st = S_IDLE;',
    `  reg [${iw - 1}:0] ap_i;`, `  reg [${ow - 1}:0] ap_o;`, `  reg [${cw - 1}:0] ap_k, ap_wp = 0, ap_nw = 0;`,
    `  reg [${clog2(k.D) - 1}:0] ap_dc;`, `  reg [${clog2(k.L) - 1}:0] ap_ph;`, `  reg [${k.raw - 1}:0] ap_base, ap_sbase;`,
    `  reg signed [${k.cW - 1}:0] ap_rom [0:${k.rn - 1}];`, `  reg signed [${k.inW - 1}:0] ap_dl [0:${k.nt - 1}];`,
    `  reg signed [${k.cW - 1}:0] ap_rom_q;`, `  reg signed [${k.inW - 1}:0] ap_dl_q;`, `  reg signed [${k.pw - 1}:0] ap_prod;`, `  reg signed [${k.accW - 1}:0] ap_acc;`,
    '  reg ap_v1, ap_v2;', `  wire [${k.accW - 1}:0] ap_acc_v = ap_acc;`,
    // (the coefficients: a block ROM; the delay line: a block RAM, zeros at the start as the C model's statics)
    '  initial begin', ...Array.from({ length: k.rn }, (_, j) => `    ap_rom[${j}] = ${k.cW}'b${bin(k.rom[j] ?? 0n, k.cW)};`),
    ...Array.from({ length: k.nt }, (_, j) => `    ap_dl[${j}] = ${k.inW}'d0;`), '  end');
  for (const x of cv.nodes) L.push(`  wire ${x.s ? 'signed ' : ''}[${x.w - 1}:0] ${sig(x)};`);
  verilogNodes(cv.nodes, cv.g, L);
  L.push(`  wire ap_take = ${k.sIn ? `ap_st == S_RD && ${n.in}_empty_n` : 'ap_st == S_WR'};`, `  wire ap_give = ap_st == S_OUT${k.sOut ? ` && ${n.out}_full_n` : ''};`,
    `  wire [${cw - 1}:0] ap_dl_addr = ap_take ? ap_wp : ap_nw >= ap_k ? ap_nw - ap_k : ap_nw + ${k.nt} - ap_k;`,
    `  wire [${k.raw - 1}:0] ap_rom_addr = ap_base + ap_k;`);
  if (k.sIn) L.push(`  assign ${n.in}_read = ap_take;`);
  else {
    L.push(`  assign ${n.in}_address0 = ap_st == S_WR ? ap_i[${k.aw.in - 1}:0] + 1'b1 : ap_i[${k.aw.in - 1}:0];`, `  assign ${n.in}_ce0 = ap_st == S_RD || (ap_st == S_WR && ap_dc != ${k.D - 1});`,
      `  assign ${n.in}_d0 = 0;`, `  assign ${n.in}_we0 = 1'b0;`, `  assign ${n.in}_address1 = 0;`, `  assign ${n.in}_ce1 = 1'b0;`, `  assign ${n.in}_d1 = 0;`, `  assign ${n.in}_we1 = 1'b0;`);
  }
  if (k.sOut) L.push(`  assign ${n.out}_din = ${sig(cv.y)};`, `  assign ${n.out}_write = ap_give;`);
  else {
    L.push(`  assign ${n.out}_address0 = ap_o[${k.aw.out - 1}:0];`, `  assign ${n.out}_ce0 = ap_give;`, `  assign ${n.out}_we0 = ap_give;`, `  assign ${n.out}_d0 = ${sig(cv.y)};`,
      `  assign ${n.out}_address1 = 0;`, `  assign ${n.out}_ce1 = 1'b0;`, `  assign ${n.out}_d1 = 0;`, `  assign ${n.out}_we1 = 1'b0;`);
  }
  if (k.cfg?.stream) L.push(`  assign ${n.config}_read = ap_st == S_CFG && ${n.config}_empty_n;`);
  L.push('  assign ap_idle = ap_st == S_IDLE;', '  assign ap_done = ap_st == S_DONE;', '  assign ap_ready = ap_st == S_DONE;');
  L.push('  always @(posedge ap_clk) begin', '    ap_rom_q <= ap_rom[ap_rom_addr];', `    if (ap_take) ap_dl[ap_dl_addr] <= ${sig(cv.x)};`, '    ap_dl_q <= ap_dl[ap_dl_addr];', '  end');
  const sbase = k.sets > 1 ? `${k.cfg.stream ? `${n.config}_dout` : n.config} * ${k.raw}'d${k.lnt}` : `${k.raw}'d0`;
  const sample = ['ap_nw <= ap_wp;', `ap_wp <= ap_wp == ${k.nt - 1} ? 0 : ap_wp + 1'b1;`, "ap_i <= ap_i + 1'b1;",
    `if (ap_dc == ${k.D - 1}) begin ap_dc <= 0; ap_ph <= 0; ap_base <= ap_sbase; ap_k <= 0; ap_acc <= 0; ap_st <= S_MAC; end`, "else ap_dc <= ap_dc + 1'b1;"];
  L.push('  always @(posedge ap_clk) begin', '    if (ap_rst) begin', '      ap_st <= S_IDLE; ap_wp <= 0; ap_nw <= 0;', "      ap_v1 <= 1'b0; ap_v2 <= 1'b0;", '    end else begin',
    "      ap_v1 <= 1'b0;", '      ap_v2 <= ap_v1;', '      if (ap_v1) ap_prod <= ap_dl_q * ap_rom_q;', '      if (ap_v2) ap_acc <= ap_acc + ap_prod;',
    '      case (ap_st)', '        S_IDLE: if (ap_start) begin', '          ap_i <= 0; ap_o <= 0; ap_dc <= 0;',
    ...(k.cfg?.stream ? [] : [`          ap_sbase <= ${sbase};`]),
    `          ap_st <= ${k.cfg?.stream ? 'S_CFG' : 'S_RD'};`, '        end',
    `        S_CFG: ${k.cfg?.stream ? `if (${n.config}_empty_n) begin ap_sbase <= ${sbase}; ap_st <= S_RD; end` : 'ap_st <= S_RD;'}`,
    ...(k.sIn ? ['        S_RD: if (ap_take) begin', ...sample.map((s) => `          ${s}`), '        end'] : ['        S_RD: ap_st <= S_WR;']),
    '        S_WR: begin', ...sample.map((s) => `          ${s}`), '        end',
    `        S_MAC: if (ap_k < ${k.nt}) begin ap_v1 <= 1'b1; ap_k <= ap_k + 1'b1; end else if (!ap_v1) ap_st <= S_OUT;`,
    "        S_OUT: if (ap_give) begin", "          ap_o <= ap_o + 1'b1;", `          if (ap_ph < ${k.L - 1}) begin ap_ph <= ap_ph + 1'b1; ap_base <= ap_base + ${k.nt}; ap_k <= 0; ap_acc <= 0; ap_st <= S_MAC; end`,
    `          else if (ap_i == ${k.inLen}) ap_st <= S_DONE;`, '          else ap_st <= S_RD;', '        end',
    '        S_DONE: ap_st <= S_IDLE;', '        default: ap_st <= S_IDLE;', '      endcase', '    end', '  end', 'endmodule', '');
  return L.join('\n');
}
