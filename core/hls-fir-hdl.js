// Silinx HLS (#1942, #1947): the hardware of hls_fir.h's hls::FIR (core/hls-fir.js), its own HDL, VHDL or Verilog, suited
// to the Spartan-3E: the MACs the rate asks for (firStructure: the multipliers' operands and products registered, an
// 18x18 multiplier's, MULT18X18SIO, for widths up to 18), the coefficients a ROM each and the delay line a RAM each
// (written so that ISE and Yosys make them block RAMs), around them:
//   the inputs read one a clock at most (an array's: its address, its value the cycle after; a stream's: when it has
//   one) and written into the delay line, a circular buffer cyclically partitioned among the MACs, one write a clock
//   in a bank of its own and each bank its own read, so that every MAC has its tap in the same clock;
//   once each decim_rate inputs (a decimator computes only the outputs it keeps), or each input interp_rate times
//   (interpolation, a phase each), the job: the taps a group a clock, oldest first (the samples arriving meanwhile
//   overwrite only what has been read); a mirrored filter's second delay line read the other way, its samples added
//   (the pre-adder) before the multiplier; the products summed in a pipelined tree, then accumulated in full precision;
//   the sum written out (converted to the output's type, as the C model's ap_fixed conversion);
//   the input held back only when its sample would start a job before the last has read its taps, all of it while a
//   stream's output is full.
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
import { firStructure, FIR_MAX_MACS } from './hls-fir.js';

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
  const st = firStructure(p);
  const M = st.macs, C = st.groups;
  const words = st.rom[0].length;
  const raw = clog2(words + 1);
  const n = { in: portOf('in'), out: portOf('out'), config: portOf('config') };
  const sIn = fir.args.in.stream, sOut = fir.args.out.stream, cfg = fir.args.config;
  const cv = conversions(p, types, sIn ? `${n.in}_dout` : `${n.in}_q0`);
  const sym = p.symmetry;
  const opW = p.inW + (sym ? 1 : 0);
  // (the tree of the products: the counts of its levels; the pipeline: the read, the operands, the product, each level)
  const tree = [M];
  while (tree.at(-1) > 1) tree.push(Math.ceil(tree.at(-1) / 2));
  const pd = 3 + tree.length - 1;
  // (where the samples are at the start: the next write at 0, the oldest tap nt - 1 before it, around the ring)
  const ring = M * st.depth, off = (ring - ((p.nt - 1) % ring)) % ring;
  // (a mirrored filter of an odd length: its centre tap counted once)
  const centre = sym && p.nt % 2 ? { t: Math.floor((st.half - 1) / M), m: (st.half - 1) % M } : null;
  const k = { ...p, ...st, M, C, aw, raw, rn: 2 ** raw, n, sIn, sOut, cfg, cv, types, lnt: p.L * C, cl: p.L * C, opW, pw: opW + p.cW, tree, pd, oa0: Math.floor(off / M), ob0: off % M, centre, sym };
  const hdl = (lang === 'vhdl' ? vhdl : verilog)(module, src, ports, k);
  const memories = ['in', 'out'].filter((a) => !fir.args[a].stream).map((a) => ({ name: a, n: a === 'in' ? p.inLen : p.outLen, w: types[a].w, s: types[a].s, aw: aw[a], read: a === 'in', written: a === 'out' }));
  const fifos = ['in', 'out', 'config'].filter((a) => fir.args[a]?.stream).map((a) => ({ name: a, dir: a === 'out' ? 'out' : 'in', w: types[a].w, s: types[a].s }));
  // (the registers: the state, the counters, the pointers, the operands, the products, the tree, the sum, the pipeline's bits)
  const dbits = clog2(st.depth), mbits = clog2(M), treeRegs = tree.slice(1).reduce((a, b) => a + b, 0);
  const regs = 2 + clog2(p.inLen + 1) + clog2(p.outLen + 1) + clog2(p.D) + 2 + clog2(k.cl + 1) + 2 * clog2(C) + 2 * raw + (sym ? 4 : 3) * dbits + (sym ? 6 : 4) * mbits + M * (opW + p.cW + k.pw) + treeRegs * p.accW + p.accW + 3 * pd + 1;
  const report = { sequential: true, states: cfg?.stream ? 4 : 3, registerBits: regs,
    memories: [{ name: 'coefficients', words: M * words, bits: p.cW, kind: 'ROM' }, { name: 'delay line', words: (sym ? 2 : 1) * ring, bits: p.inW, kind: 'RAM' }], loops: [],
    fir: { taps: p.taps, sets: p.sets, accW: p.accW, outW: p.outW, clocksPerInput: st.cps, macs: M, tapsPerMac: C, preAdder: sym } };
  // (the rate asks for more multipliers than any board has: said, the filter slower)
  const diagnostics = st.wanted > M ? [{ line: fir.loc?.line ?? 0, col: fir.loc?.col ?? 0, severity: 'warning',
    message: `hls::FIR<${p.name}>: ${st.half} taps at ${st.cps} clock${st.cps > 1 ? 's' : ''} an input ask for ${st.wanted} multipliers: Silinx HLS makes ${FIR_MAX_MACS}, an output taking ${C} clocks (a larger sample_period says the rate the filter must sustain)` }] : [];
  return { ok: true, hdl, top: module, ports, diagnostics, sequential: true, states: report.states, memories, fifos, report };
}

const range = (n) => Array.from({ length: n }, (_, j) => j);

// ------------------------------------------------------------------------------------------- VHDL
function vhdl(name, src, ports, k) {
  const { n, cv, M, C, D, pd, sym } = k;
  const T = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
  const iw = clog2(k.inLen + 1) + 1, ow = clog2(k.outLen + 1) + 1, dd = k.depth;
  const L = [`-- Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): hls::FIR, ${k.type}, ${k.taps} taps${k.sets > 1 ? ` x ${k.sets} sets` : ''}, ${M} MAC${M > 1 ? 's' : ''}${sym ? ', pre-adder' : ''}: edit the C source`,
    'library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '', `entity ${name} is`, '  port ('];
  ports.forEach((q, i) => L.push(`    ${q.name} : ${q.dir} ${T(q.w)}${i < ports.length - 1 ? ';' : ''}`));
  const banks = range(M), bankNames = sym ? ['dl', 'dm'] : ['dl'];
  const sg = (w) => `signed(${w - 1} downto 0)`;
  L.push('  );', `end ${name};`, '', `architecture behav of ${name} is`,
    '  type ap_st_t is (S_IDLE, S_CFG, S_RUN, S_DONE);', '  signal ap_st : ap_st_t := S_IDLE;',
    `  signal ap_r : unsigned(${iw - 1} downto 0);`, `  signal ap_o : unsigned(${ow - 1} downto 0);`,
    `  signal ap_dc : integer range 0 to ${D - 1};`,
    `  signal ap_wb : integer range 0 to ${M - 1} := 0;`, `  signal ap_wa : integer range 0 to ${dd - 1} := 0;`,
    `  signal ap_ob : integer range 0 to ${M - 1} := ${k.ob0};`, `  signal ap_oa : integer range 0 to ${dd - 1} := ${k.oa0};`,
    `  signal ap_qb, ap_qbd, ap_pb, ap_pbd : integer range 0 to ${M - 1} := 0;`, `  signal ap_qa, ap_qa0, ap_qa1, ap_pa, ap_pa1 : integer range 0 to ${dd - 1} := 0;`,
    `  signal ap_t, ap_td : integer range 0 to ${C - 1} := 0;`, `  signal ap_n, ap_nn : integer range 0 to ${k.cl} := 0;`,
    `  signal ap_base, ap_sbase : unsigned(${k.raw - 1} downto 0);`,
    "  signal ap_ce, ap_issue, ap_take, ap_give, ap_launch, ap_rd_v, ap_rd_l, ap_free, ap_v0, ap_f0, ap_l0, ap_out_v : std_logic := '0';",
    `  signal ap_vv, ap_vf, ap_vl : std_logic_vector(${pd - 1} downto 0) := (others => '0');`,
    // (the coefficients: a block ROM each; the delay line: a block RAM each, zeros at the start as the C model's statics)
    `  type ap_rom_t is array (0 to ${k.rn - 1}) of ${sg(k.cW)};`, `  type ap_dl_t is array (0 to ${dd - 1}) of ${sg(k.inW)};`);
  for (const m of banks) L.push(`  constant ap_rom_${m} : ap_rom_t := (${range(k.rn).map((j) => `${j} => "${bin(k.rom[m][j] ?? 0n, k.cW)}"`).join(', ')});`);
  for (const b of bankNames) for (const m of banks) L.push(`  signal ap_${b}_${m} : ap_dl_t := (others => (others => '0'));`, `  signal ap_${b}_q_${m}, ap_${b}_x_${m} : ${sg(k.inW)};`, `  signal ap_${b}_a_${m} : integer range 0 to ${dd - 1};`);
  for (const m of banks) L.push(`  signal ap_rom_q_${m}, ap_c_${m} : ${sg(k.cW)};`, `  signal ap_x_${m} : ${sg(k.opW)};`, `  signal ap_prod_${m} : ${sg(k.pw)};`);
  k.tree.forEach((c, l) => { for (let j = 0; j < c; j++) L.push(`  signal ap_s_${l}_${j} : ${sg(k.accW)};`); });
  L.push(`  signal ap_acc : ${sg(k.accW)};`, `  signal ap_acc_v : std_logic_vector(${k.accW - 1} downto 0);`,
    // (the addresses and the config as unsigned, a port of one bit too)
    `  signal ap_in_addr : unsigned(${k.aw.in - 1} downto 0);`, `  signal ap_out_addr : unsigned(${k.aw.out - 1} downto 0);`, `  signal ap_cfg : unsigned(${k.cfg ? k.types.config.w - 1 : 0} downto 0);`);
  for (const x of cv.nodes) L.push(`  signal ${sig(x)} : ${x.s ? 'signed' : 'unsigned'}(${x.w - 1} downto 0);`);
  L.push('begin');
  vhdlNodes(cv.nodes, cv.g, L);
  const zero = (w) => (w === 1 ? "'0'" : "(others => '0')");
  const vec = (x, w) => (w === 1 ? `${x}(0)` : `std_logic_vector(${x})`);
  const slv = (x, w) => (w === 1 ? `${sig(x)}(0)` : `std_logic_vector(${sig(x)})`);
  // (the input: one read a clock, held back when its sample would start a job while the last still reads its taps)
  L.push(k.sOut ? `  ap_ce <= '0' when ap_out_v = '1' and ${n.out}_full_n = '0' else '1';` : "  ap_ce <= '1';",
    `  ap_nn <= ${k.cl} when ap_launch = '1' else ap_n - 1 when ap_n > 0 else 0;`,
    `  ap_free <= '1' when ${k.sIn ? 'ap_n' : 'ap_nn'} <= 1 else '0';`,
    `  ap_issue <= '1' when ap_ce = '1' and ap_st = S_RUN and ap_r < ${k.inLen} and (ap_dc /= ${D - 1} or ap_free = '1')${k.sIn ? ` and ${n.in}_empty_n = '1'` : ''} else '0';`,
    k.sIn ? '  ap_take <= ap_issue;' : '  ap_take <= ap_rd_v;',
    k.sIn ? `  ap_launch <= '1' when ap_issue = '1' and ap_dc = ${D - 1} else '0';` : '  ap_launch <= ap_rd_l;',
    "  ap_give <= ap_out_v and ap_ce;", "  ap_v0 <= '1' when ap_n > 0 else '0';", "  ap_f0 <= '1' when ap_t = 0 else '0';", `  ap_l0 <= '1' when ap_t = ${C - 1} else '0';`,
    `  ap_qa1 <= 0 when ap_qa = ${dd - 1} else ap_qa + 1;`, `  ap_pa1 <= ${dd - 1} when ap_pa = 0 else ap_pa - 1;`, '  ap_acc_v <= std_logic_vector(ap_acc);');
  if (k.sIn) L.push(`  ${n.in}_read <= ap_take;`);
  else {
    L.push(`  ap_in_addr <= ap_r(${k.aw.in - 1} downto 0);`, `  ${n.in}_address0 <= ${vec('ap_in_addr', k.aw.in)};`, `  ${n.in}_ce0 <= ap_issue;`,
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
  // (each bank its read: the oldest group's samples around the ring; each MAC its bank's sample, rotated; the pre-adder)
  const pick = (list, sel) => list.reduce((e, [v, i], j) => (j === list.length - 1 ? `${e}${v}` : `${e}${v} when ${sel} = ${i} else `), '');
  for (const m of banks) {
    L.push(`  ap_dl_a_${m} <= ap_qa1 when ap_qb > ${m} else ap_qa;`);
    if (sym) L.push(`  ap_dm_a_${m} <= ap_pa1 when ap_pb < ${m} else ap_pa;`);
    L.push(`  ap_dl_x_${m} <= ${pick(banks.map((b) => [`ap_dl_q_${(b + m) % M}`, b]), 'ap_qbd')};`);
    if (sym) {
      const a = pick(banks.map((b) => [`ap_dm_q_${(b - m + M) % M}`, b]), 'ap_pbd');
      L.push(`  ap_dm_x_${m} <= ${k.centre?.m === m ? `(others => '0') when ap_td = ${k.centre.t} else ` : ''}${a};`);
    }
    L.push(`  ap_s_0_${m} <= resize(ap_prod_${m}, ${k.accW});`);
  }
  const preadd = (m) => (sym === 'negative' ? `resize(ap_dl_x_${m}, ${k.opW}) - resize(ap_dm_x_${m}, ${k.opW})` : sym ? `resize(ap_dl_x_${m}, ${k.opW}) + resize(ap_dm_x_${m}, ${k.opW})` : `ap_dl_x_${m}`);
  L.push('  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', "      if ap_ce = '1' then");
  for (const m of banks) {
    L.push(`        ap_rom_q_${m} <= ap_rom_${m}(to_integer(ap_base));`);
    for (const b of bankNames) L.push(`        ap_${b}_q_${m} <= ap_${b}_${m}(ap_${b}_a_${m});`);
  }
  L.push('      end if;', "      if ap_take = '1' and ap_ce = '1' then");
  for (const m of banks) { L.push(`        if ap_wb = ${m} then`); for (const b of bankNames) L.push(`          ap_${b}_${m}(ap_wa) <= ${sig(cv.x)};`); L.push('        end if;'); }
  L.push('      end if;', '    end if;', '  end process;');
  // (the set's first coefficient: the config's set times its groups; one set, the first)
  const sbase = k.sets > 1 ? `resize(ap_cfg * to_unsigned(${k.lnt}, ${k.raw}), ${k.raw})` : `to_unsigned(0, ${k.raw})`;
  const tail = (v, x) => `${v} <= ${v}(${pd - 2} downto 0) & ${x};`;
  L.push('  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', "      if ap_rst = '1' then",
    `        ap_st <= S_IDLE; ap_wb <= 0; ap_wa <= 0; ap_ob <= ${k.ob0}; ap_oa <= ${k.oa0}; ap_n <= 0;`, "        ap_rd_v <= '0'; ap_rd_l <= '0'; ap_out_v <= '0'; ap_vv <= (others => '0');",
    "      elsif ap_ce = '1' then", `        ${tail('ap_vv', 'ap_v0')}`, `        ${tail('ap_vf', 'ap_f0')}`, `        ${tail('ap_vl', 'ap_l0')}`, '        ap_qbd <= ap_qb; ap_pbd <= ap_pb; ap_td <= ap_t;');
  for (const m of banks) L.push(`        ap_c_${m} <= ap_rom_q_${m}; ap_x_${m} <= ${preadd(m)}; ap_prod_${m} <= ap_x_${m} * ap_c_${m};`);
  k.tree.slice(1).forEach((c, l) => { for (let j = 0; j < c; j++) L.push(`        ap_s_${l + 1}_${j} <= ${2 * j + 1 < k.tree[l] ? `ap_s_${l}_${2 * j} + ap_s_${l}_${2 * j + 1}` : `ap_s_${l}_${2 * j}`};`); });
  const sum = `ap_s_${k.tree.length - 1}_0`;
  L.push(`        if ap_vv(${pd - 1}) = '1' then`, `          if ap_vf(${pd - 1}) = '1' then ap_acc <= ${sum}; else ap_acc <= ap_acc + ${sum}; end if;`, '        end if;',
    `        ap_out_v <= ap_vv(${pd - 1}) and ap_vl(${pd - 1});`,
    ...(k.sIn ? [] : ['        ap_rd_v <= ap_issue;', `        if ap_issue = '1' and ap_dc = ${D - 1} then ap_rd_l <= '1'; else ap_rd_l <= '0'; end if;`]),
    "        if ap_issue = '1' then", '          ap_r <= ap_r + 1;', `          if ap_dc = ${D - 1} then ap_dc <= 0; else ap_dc <= ap_dc + 1; end if;`, '        end if;',
    "        if ap_take = '1' then",
    `          if ap_wb = ${M - 1} then ap_wb <= 0; if ap_wa = ${dd - 1} then ap_wa <= 0; else ap_wa <= ap_wa + 1; end if; else ap_wb <= ap_wb + 1; end if;`,
    `          if ap_ob = ${M - 1} then ap_ob <= 0; if ap_oa = ${dd - 1} then ap_oa <= 0; else ap_oa <= ap_oa + 1; end if; else ap_ob <= ap_ob + 1; end if;`, '        end if;',
    '        ap_n <= ap_nn;',
    "        if ap_launch = '1' then", '          ap_qb <= ap_ob; ap_qa <= ap_oa; ap_qa0 <= ap_oa; ap_pb <= ap_wb; ap_pa <= ap_wa; ap_t <= 0; ap_base <= ap_sbase;',
    '        elsif ap_n > 0 then', '          ap_base <= ap_base + 1; ap_pa <= ap_pa1;', `          if ap_t = ${C - 1} then ap_t <= 0; ap_qa <= ap_qa0; else ap_t <= ap_t + 1; ap_qa <= ap_qa1; end if;`, '        end if;',
    "        if ap_give = '1' then ap_o <= ap_o + 1; end if;",
    '        case ap_st is', '          when S_IDLE =>', "            if ap_start = '1' then", "              ap_r <= (others => '0'); ap_o <= (others => '0'); ap_dc <= 0;",
    ...(k.cfg?.stream ? [] : [`              ap_sbase <= ${sbase};`]),
    `              ap_st <= ${k.cfg?.stream ? 'S_CFG' : 'S_RUN'};`, '            end if;',
    '          when S_CFG =>', ...(k.cfg?.stream ? [`            if ${n.config}_empty_n = '1' then`, `              ap_sbase <= ${sbase};`, '              ap_st <= S_RUN;', '            end if;'] : ['            ap_st <= S_RUN;']),
    '          when S_RUN =>', `            if ap_give = '1' and ap_o = ${k.outLen - 1} then ap_st <= S_DONE; end if;`,
    '          when S_DONE =>', '            ap_st <= S_IDLE;', '        end case;', '      end if;', '    end if;', '  end process;', 'end behav;', '');
  return L.join('\n');
}

// ------------------------------------------------------------------------------------------- Verilog
function verilog(name, src, ports, k) {
  const { n, cv, M, C, D, pd, sym } = k;
  const W = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const iw = clog2(k.inLen + 1) + 1, ow = clog2(k.outLen + 1) + 1, dd = k.depth;
  const S = { S_IDLE: 0, S_CFG: 1, S_RUN: 2, S_DONE: 3 };
  const mw = clog2(M), dw = clog2(dd), tw = clog2(C), nw = clog2(k.cl + 1);
  const banks = range(M), bankNames = sym ? ['dl', 'dm'] : ['dl'];
  const L = [`// Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): hls::FIR, ${k.type}, ${k.taps} taps${k.sets > 1 ? ` x ${k.sets} sets` : ''}, ${M} MAC${M > 1 ? 's' : ''}${sym ? ', pre-adder' : ''}: edit the C source`, `module ${name} (`];
  ports.forEach((q, i) => L.push(`  ${q.dir === 'in' ? 'input ' : 'output'} wire ${W(q.w)}${q.name}${i < ports.length - 1 ? ',' : ''}`));
  L.push(');', ...Object.entries(S).map(([s, v]) => `  localparam ${s} = 2'd${v};`), '  reg [1:0] ap_st = S_IDLE;',
    `  reg [${iw - 1}:0] ap_r;`, `  reg [${ow - 1}:0] ap_o;`, `  reg [${clog2(D) - 1}:0] ap_dc;`,
    `  reg [${mw - 1}:0] ap_wb = 0, ap_ob = ${k.ob0}, ap_qb = 0, ap_qbd = 0, ap_pb = 0, ap_pbd = 0;`, `  reg [${dw - 1}:0] ap_wa = 0, ap_oa = ${k.oa0}, ap_qa = 0, ap_qa0 = 0, ap_pa = 0;`,
    `  reg [${tw - 1}:0] ap_t = 0, ap_td = 0;`, `  reg [${nw - 1}:0] ap_n = 0;`, `  reg [${k.raw - 1}:0] ap_base, ap_sbase;`,
    "  reg ap_rd_v = 1'b0, ap_rd_l = 1'b0, ap_out_v = 1'b0;", `  reg [${pd - 1}:0] ap_vv = 0, ap_vf = 0, ap_vl = 0;`,
    `  reg signed [${k.accW - 1}:0] ap_acc;`, `  wire [${k.accW - 1}:0] ap_acc_v = ap_acc;`);
  for (const m of banks) L.push(`  reg signed [${k.cW - 1}:0] ap_rom_${m} [0:${k.rn - 1}];`, `  reg signed [${k.cW - 1}:0] ap_rom_q_${m}, ap_c_${m};`, `  reg signed [${k.opW - 1}:0] ap_x_${m};`, `  reg signed [${k.pw - 1}:0] ap_prod_${m};`);
  for (const b of bankNames) for (const m of banks) L.push(`  reg signed [${k.inW - 1}:0] ap_${b}_${m} [0:${dd - 1}];`, `  reg signed [${k.inW - 1}:0] ap_${b}_q_${m};`);
  // (the coefficients: a block ROM each; the delay line: a block RAM each, zeros at the start as the C model's statics)
  L.push('  initial begin');
  for (const m of banks) for (const j of range(k.rn)) L.push(`    ap_rom_${m}[${j}] = ${k.cW}'b${bin(k.rom[m][j] ?? 0n, k.cW)};`);
  for (const b of bankNames) for (const m of banks) for (const j of range(dd)) L.push(`    ap_${b}_${m}[${j}] = ${k.inW}'d0;`);
  L.push('  end');
  for (const x of cv.nodes) L.push(`  wire ${x.s ? 'signed ' : ''}[${x.w - 1}:0] ${sig(x)};`);
  verilogNodes(cv.nodes, cv.g, L);
  // (the input: one read a clock, held back when its sample would start a job while the last still reads its taps)
  L.push(`  wire ap_ce = ${k.sOut ? `!(ap_out_v && !${n.out}_full_n)` : "1'b1"};`,
    `  wire ap_issue, ap_launch;`,
    `  wire [${nw - 1}:0] ap_nn = ap_launch ? ${k.cl} : ap_n > 0 ? ap_n - 1'b1 : 0;`,
    `  wire ap_free = ${k.sIn ? 'ap_n' : 'ap_nn'} <= 1;`,
    `  assign ap_issue = ap_ce && ap_st == S_RUN && ap_r < ${k.inLen} && (ap_dc != ${D - 1} || ap_free)${k.sIn ? ` && ${n.in}_empty_n` : ''};`,
    `  wire ap_take = ${k.sIn ? 'ap_issue' : 'ap_rd_v'};`,
    `  assign ap_launch = ${k.sIn ? `ap_issue && ap_dc == ${D - 1}` : 'ap_rd_l'};`,
    '  wire ap_give = ap_out_v && ap_ce;', '  wire ap_v0 = ap_n > 0;', '  wire ap_f0 = ap_t == 0;', `  wire ap_l0 = ap_t == ${C - 1};`,
    `  wire [${dw - 1}:0] ap_qa1 = ap_qa == ${dd - 1} ? 0 : ap_qa + 1'b1;`, `  wire [${dw - 1}:0] ap_pa1 = ap_pa == 0 ? ${dd - 1} : ap_pa - 1'b1;`);
  if (k.sIn) L.push(`  assign ${n.in}_read = ap_take;`);
  else {
    L.push(`  assign ${n.in}_address0 = ap_r[${k.aw.in - 1}:0];`, `  assign ${n.in}_ce0 = ap_issue;`,
      `  assign ${n.in}_d0 = 0;`, `  assign ${n.in}_we0 = 1'b0;`, `  assign ${n.in}_address1 = 0;`, `  assign ${n.in}_ce1 = 1'b0;`, `  assign ${n.in}_d1 = 0;`, `  assign ${n.in}_we1 = 1'b0;`);
  }
  if (k.sOut) L.push(`  assign ${n.out}_din = ${sig(cv.y)};`, `  assign ${n.out}_write = ap_give;`);
  else {
    L.push(`  assign ${n.out}_address0 = ap_o[${k.aw.out - 1}:0];`, `  assign ${n.out}_ce0 = ap_give;`, `  assign ${n.out}_we0 = ap_give;`, `  assign ${n.out}_d0 = ${sig(cv.y)};`,
      `  assign ${n.out}_address1 = 0;`, `  assign ${n.out}_ce1 = 1'b0;`, `  assign ${n.out}_d1 = 0;`, `  assign ${n.out}_we1 = 1'b0;`);
  }
  if (k.cfg?.stream) L.push(`  assign ${n.config}_read = ap_st == S_CFG && ${n.config}_empty_n;`);
  L.push('  assign ap_idle = ap_st == S_IDLE;', '  assign ap_done = ap_st == S_DONE;', '  assign ap_ready = ap_st == S_DONE;');
  // (each bank its read: the oldest group's samples around the ring; each MAC its bank's sample, rotated; the pre-adder)
  const pick = (list, sel) => list.reduce((e, [v, i], j) => (j === list.length - 1 ? `${e}${v}` : `${e}${sel} == ${i} ? ${v} : `), '');
  for (const m of banks) {
    L.push(`  wire signed [${k.inW - 1}:0] ap_dl_x_${m} = ${pick(banks.map((b) => [`ap_dl_q_${(b + m) % M}`, b]), 'ap_qbd')};`);
    if (sym) {
      const a = pick(banks.map((b) => [`ap_dm_q_${(b - m + M) % M}`, b]), 'ap_pbd');
      L.push(`  wire signed [${k.inW - 1}:0] ap_dm_x_${m} = ${k.centre?.m === m ? `ap_td == ${k.centre.t} ? 0 : ` : ''}${a};`);
    }
  }
  k.tree.forEach((c, l) => { for (let j = 0; j < c; j++) L.push(l ? `  reg signed [${k.accW - 1}:0] ap_s_${l}_${j};` : `  wire signed [${k.accW - 1}:0] ap_s_0_${j} = ap_prod_${j};`); });
  L.push('  always @(posedge ap_clk) begin', '    if (ap_ce) begin');
  for (const m of banks) {
    L.push(`      ap_rom_q_${m} <= ap_rom_${m}[ap_base];`, `      ap_dl_q_${m} <= ap_dl_${m}[ap_qb > ${m} ? ap_qa1 : ap_qa];`);
    if (sym) L.push(`      ap_dm_q_${m} <= ap_dm_${m}[ap_pb < ${m} ? ap_pa1 : ap_pa];`);
  }
  L.push('    end', '    if (ap_take && ap_ce) begin');
  for (const m of banks) for (const b of bankNames) L.push(`      if (ap_wb == ${m}) ap_${b}_${m}[ap_wa] <= ${sig(cv.x)};`);
  L.push('    end', '  end');
  const sbase = k.sets > 1 ? `${k.cfg.stream ? `${n.config}_dout` : n.config} * ${k.raw}'d${k.lnt}` : `${k.raw}'d0`;
  const tail = (v, x) => `${v} <= {${v}[${pd - 2}:0], ${x}};`;
  const preadd = (m) => (sym === 'negative' ? `ap_dl_x_${m} - ap_dm_x_${m}` : sym ? `ap_dl_x_${m} + ap_dm_x_${m}` : `ap_dl_x_${m}`);
  const sum = `ap_s_${k.tree.length - 1}_0`;
  L.push('  always @(posedge ap_clk) begin', '    if (ap_rst) begin', `      ap_st <= S_IDLE; ap_wb <= 0; ap_wa <= 0; ap_ob <= ${k.ob0}; ap_oa <= ${k.oa0}; ap_n <= 0;`, "      ap_rd_v <= 1'b0; ap_rd_l <= 1'b0; ap_out_v <= 1'b0; ap_vv <= 0;", '    end else if (ap_ce) begin',
    `      ${tail('ap_vv', 'ap_v0')}`, `      ${tail('ap_vf', 'ap_f0')}`, `      ${tail('ap_vl', 'ap_l0')}`, '      ap_qbd <= ap_qb; ap_pbd <= ap_pb; ap_td <= ap_t;');
  for (const m of banks) L.push(`      ap_c_${m} <= ap_rom_q_${m}; ap_x_${m} <= ${preadd(m)}; ap_prod_${m} <= ap_x_${m} * ap_c_${m};`);
  k.tree.slice(1).forEach((c, l) => { for (let j = 0; j < c; j++) L.push(`      ap_s_${l + 1}_${j} <= ${2 * j + 1 < k.tree[l] ? `ap_s_${l}_${2 * j} + ap_s_${l}_${2 * j + 1}` : `ap_s_${l}_${2 * j}`};`); });
  L.push(`      if (ap_vv[${pd - 1}]) ap_acc <= ap_vf[${pd - 1}] ? ${sum} : ap_acc + ${sum};`, `      ap_out_v <= ap_vv[${pd - 1}] && ap_vl[${pd - 1}];`,
    ...(k.sIn ? [] : ['      ap_rd_v <= ap_issue;', `      ap_rd_l <= ap_issue && ap_dc == ${D - 1};`]),
    `      if (ap_issue) begin ap_r <= ap_r + 1'b1; ap_dc <= ap_dc == ${D - 1} ? 0 : ap_dc + 1'b1; end`,
    '      if (ap_take) begin',
    `        if (ap_wb == ${M - 1}) begin ap_wb <= 0; ap_wa <= ap_wa == ${dd - 1} ? 0 : ap_wa + 1'b1; end else ap_wb <= ap_wb + 1'b1;`,
    `        if (ap_ob == ${M - 1}) begin ap_ob <= 0; ap_oa <= ap_oa == ${dd - 1} ? 0 : ap_oa + 1'b1; end else ap_ob <= ap_ob + 1'b1;`, '      end',
    '      ap_n <= ap_nn;',
    '      if (ap_launch) begin ap_qb <= ap_ob; ap_qa <= ap_oa; ap_qa0 <= ap_oa; ap_pb <= ap_wb; ap_pa <= ap_wa; ap_t <= 0; ap_base <= ap_sbase; end',
    `      else if (ap_n > 0) begin ap_base <= ap_base + 1'b1; ap_pa <= ap_pa1; if (ap_t == ${C - 1}) begin ap_t <= 0; ap_qa <= ap_qa0; end else begin ap_t <= ap_t + 1'b1; ap_qa <= ap_qa1; end end`,
    "      if (ap_give) ap_o <= ap_o + 1'b1;",
    '      case (ap_st)', '        S_IDLE: if (ap_start) begin', '          ap_r <= 0; ap_o <= 0; ap_dc <= 0;',
    ...(k.cfg?.stream ? [] : [`          ap_sbase <= ${sbase};`]),
    `          ap_st <= ${k.cfg?.stream ? 'S_CFG' : 'S_RUN'};`, '        end',
    `        S_CFG: ${k.cfg?.stream ? `if (${n.config}_empty_n) begin ap_sbase <= ${sbase}; ap_st <= S_RUN; end` : 'ap_st <= S_RUN;'}`,
    `        S_RUN: if (ap_give && ap_o == ${k.outLen - 1}) ap_st <= S_DONE;`,
    '        S_DONE: ap_st <= S_IDLE;', '        default: ap_st <= S_IDLE;', '      endcase', '    end', '  end', 'endmodule', '');
  return L.join('\n');
}
