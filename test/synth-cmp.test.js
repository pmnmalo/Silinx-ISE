// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only (NOTICE)
// The comparisons with a constant as logic (#3097, packages/silinx-fpga/src/synth-cmp.js): CMP_MAP proved equivalent to
// Yosys's own comparison cells by SAT (every operator, signed and unsigned, the constant on either side, widths that
// differ), the comparisons of 4 bits or fewer and of two signals left alone, and cmpStep's commands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CMP_FILE, CMP_MAP, CMP_SET_FILE, cmpStep, cmpSet, sharedComparisons, keepCmp, cmpChoice, probeComparisons } from '../packages/silinx-fpga/src/synth-cmp.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const OPS = ['<', '<=', '>', '>='];
// [the signal's width, signed, the constant (its width, value), the constant on the left]
const CASES = [
  [9, false, 7, 99, false], [9, false, 4, 9, false], [9, true, 9, -22, false], [9, true, 9, 0, false], [9, true, 32, 50, false],
  [9, false, 7, 99, true], [9, true, 9, -22, true], [5, false, 3, 5, false], [5, true, 5, -16, false], [5, true, 5, 15, true],
  [19, false, 19, 0, false], [19, false, 1, 1, false], [8, false, 8, 255, false], [8, false, 8, 0, true], [6, false, 10, 600, false],
];
const lit = (w, signed, v) => `${v < 0 ? '-' : ''}${w}'${signed ? 's' : ''}d${Math.abs(v)}`;

function design() {
  const ports = [], lines = [];
  CASES.forEach(([xw, signed, cw, cv, left], i) => {
    ports.push(`input ${signed ? 'signed ' : ''}[${xw - 1}:0] x${i}`);
    OPS.forEach((op, j) => {
      ports.push(`output y${i}_${j}`);
      const c = lit(cw, signed, cv);
      lines.push(`assign y${i}_${j} = ${left ? `${c} ${op} x${i}` : `x${i} ${op} ${c}`};`);
    });
  });
  ports.push('input [5:0] a', 'input [5:0] b', 'output ab', 'input [3:0] s', 'output sc');
  lines.push('assign ab = a < b;', 'assign sc = s > 4\'d9;');
  return `module top(${ports.join(', ')});\n${lines.join('\n')}\nendmodule\n`;
}

const run = async script => {
  const lines = [];
  const files = await yosysNode(['-q', '-p', script], { 'top.v': design(), [CMP_FILE]: CMP_MAP }, l => lines.push(l));
  return { lines, files };
};

test('CMP_MAP: every comparison of a signal wider than 4 bits with a constant as gates, equivalent to the comparison', async () => {
  const { lines, files } = await run(`read_verilog top.v; proc; opt_clean; rename top gold; design -stash gold; read_verilog top.v; proc; opt_clean; `
    + `techmap -map ${CMP_FILE}; rename top gate; design -stash gate; design -copy-from gold -as gold gold; `
    + 'design -copy-from gate -as gate gate; miter -equiv -flatten -make_assert gold gate miter; hierarchy -top miter; '
    + 'tee -q -o sat.txt sat -verify -prove-asserts miter');
  assert.ok(!lines.some(l => /ERROR/.test(l)), lines.join('\n'));
  assert.match(files['sat.txt'], /SAT proof finished - no model found: SUCCESS!/);
});

test('CMP_MAP: the comparisons of 4 bits or fewer and of two signals left to synth_xilinx', async () => {
  const { files } = await run(`read_verilog top.v; proc; opt_clean; techmap -map ${CMP_FILE}; tee -q -o cells.txt stat`);
  const stat = files['cells.txt'];
  const count = type => +(stat.match(new RegExp(`(\\d+)\\s+\\${type}\\b`))?.[1] ?? 0);
  // a < b (two signals) and s > 9 (4 bits) stay; the others are gates
  assert.equal(count('$lt'), 1);
  assert.equal(count('$gt'), 1);
  assert.equal(count('$le') + count('$ge'), 0);
});

test('cmpStep: the comparisons listed mapped just before synth_xilinx\'s coarse step; none listed, the commands as they are', () => {
  const synth = 'synth_xilinx -family xc3se -ise -flatten -top t';
  const MAP = `select -set silinx_cmp -read ${CMP_SET_FILE}; techmap -map ${CMP_FILE} @silinx_cmp; select -clear`;
  const cmp = ['$gt$t_syn.v:3$1'];
  assert.equal(cmpStep(`${synth} -run :fine; memory_map`, cmp), `${synth} -run :coarse; ${MAP}; ${synth} -run coarse:fine; memory_map`);
  assert.equal(cmpStep(`${synth} -run :map_ffram; count; ${synth} -run map_ffram:fine`, cmp),
    `${synth} -run :coarse; ${MAP}; ${synth} -run coarse:map_ffram; count; ${synth} -run map_ffram:fine`);
  // the state machines' run 3 (synth-fsm.js fsmRestCommands) from map_dsp; their probe, up to prepare, not
  assert.equal(cmpStep(`read_rtlil p.il; ${synth} -run map_dsp:fine; abc`, cmp), `read_rtlil p.il; ${synth} -run map_dsp:coarse; ${MAP}; ${synth} -run coarse:fine; abc`);
  for (const c of [`${synth} -run :prepare; opt`, `${synth} -run :coarse`, `${synth} -run fine:map_ffs; ${synth} -run map_ffs:map_luts`, 'read_rtlil x.il; abc'])
    assert.equal(cmpStep(c, cmp), c);
  // the whole script, and once only
  assert.equal(cmpStep(`${synth} -run :`, cmp), `${synth} -run :coarse; ${MAP}; ${synth} -run coarse:`);
  const once = cmpStep(`${synth} -run :fine; abc`, cmp);
  assert.equal(cmpStep(once, cmp), once);
  for (const none of [null, undefined, []]) assert.equal(cmpStep(`${synth} -run :fine`, none), `${synth} -run :fine`);
  assert.equal(cmpSet('t', ['$gt$a', '$lt$b']), 't/$gt$a\nt/$lt$b\n');
});

test('#3171 cmpStep: the runs found as the RegExp it replaced found them, and in linear time (CodeQL js/polynomial-redos)', () => {
  const cmp = ['$gt$t_syn.v:3$1'];
  // the old match, each of its runs mapped alone: the same commands
  const old = c => c.replace(/(synth_xilinx [^;]*?) -run (\w*):(\w*)/g, m => cmpStep(m, cmp));
  const s = 'synth_xilinx -top t';
  for (const c of [`${s} -run :fine`, `${s} -run :fine; ${s} -run :fine`, `${s} -run :fine ${s} -run map_dsp:`, `x; ${s}; ${s} -run :`,
    `${s} -run x -run :fine`, `${s} -run:fine; ${s}  -run :fine`, `synth_xilinx -run :fine`, `synth_xilinx  -run :`, `${s} -run :fine -run :fine`,
    `a${s} -run ::fine`, `${s} -run :prepare; opt; synth_xilinx synth_xilinx -run map_dsp:fine; ${s}`, '', ';;', 'synth_xilinx '])
    assert.equal(cmpStep(c, cmp), old(c), c);
  // many synth_xilinx with no run, in one command and in many: at once (the RegExp's 40 000: seconds)
  for (const c of ['synth_xilinx '.repeat(40000), 'synth_xilinx ;'.repeat(40000), `${s} -run`.repeat(40000), `${s} -run a`.repeat(40000)]) {
    const t0 = performance.now();
    assert.equal(cmpStep(c, cmp), c);
    assert.ok(performance.now() - t0 < 500, `${c.slice(0, 20)}…: ${performance.now() - t0} ms`);
  }
});

test('synthCommands and yosysFiles: the comparisons of opts.cmp mapped before the coarse step on every script; without it, as before', async () => {
  const { synthCommands, yosysFiles, memorySteps } = await import('../packages/silinx-fpga/src/synth-open.js');
  const synth = 'synth_xilinx -family xc3se -ise -flatten -top t';
  const cmp = ['$gt$t_syn.v:3$1'];
  for (const opts of [{}, { srl: false }, { premap: 'p.il' }, { lutram: true }]) {
    const cmds = synthCommands('t', 'spartan3e', { ...opts, cmp });
    assert.equal(cmds.split(`techmap -map ${CMP_FILE} @silinx_cmp`).length, 2, JSON.stringify(opts));
    assert.ok(cmds.includes(`${synth} -run :coarse; select -set silinx_cmp -read ${CMP_SET_FILE}`), JSON.stringify(opts));
    assert.ok(!synthCommands('t', 'spartan3e', opts).includes(CMP_FILE), JSON.stringify(opts));
  }
  assert.equal(memorySteps(synth), `${synth} -run :fine`);
  assert.equal(synthCommands('t', 'virtex5', { cmp }), 'synth_xilinx -family xc5v -ise -flatten -top t');
  assert.deepEqual([yosysFiles('t', '', { cmp })[CMP_FILE], yosysFiles('t', '', { cmp })[CMP_SET_FILE]], [CMP_MAP, 't/$gt$t_syn.v:3$1\n']);
  assert.ok(!(CMP_FILE in yosysFiles('t', '')) && !(CMP_FILE in yosysFiles('t', '', { cmp: [] })));
});

test('sharedComparisons: a signal wider than 4 bits compared with two constants or more; one alone, two signals, 4 bits, not', () => {
  const cell = (type, A, B) => ({ type, connections: { A, B, Y: [99] } });
  const x = [2, 3, 4, 5, 6], y = [7, 8, 9, 10, 11];
  const nl = { modules: { t: { cells: {
    a: cell('$gt', x, ['1', '0', '1']), b: cell('$lt', ['0', '1'], x), c: cell('$le', x, ['0']),
    d: cell('$ge', y, ['1', '1']), e: cell('$gt', x, y), f: cell('$gt', [2, 3, 4, 5], ['1']), g: cell('$gt', [2, 3, 4, 5], ['0']),
    h: cell('$eq', y, ['1']), i: cell('$gt', ['1'], ['0']),
  } } } };
  assert.deepEqual(sharedComparisons(nl, 't'), ['a', 'b', 'c']);
  assert.deepEqual(sharedComparisons(JSON.stringify(nl), 't'), ['a', 'b', 'c']);
  // an OR of the signal's high bits, alone: y > 0, y > 7, y >= 8, y < 16, y <= 3, 8 > y (y < 8), 0 < y, 7 < y; not y > 5, y >= 6,
  // 6 < y, y <= 4, a signed y > 0
  const one = (type, A, B, extra = {}) => ({ modules: { t: { cells: { r: { ...cell(type, A, B), ...extra } } } } });
  const bin = n => [...n.toString(2)].reverse();
  for (const [type, c, left, yes] of [['$gt', 0, false, true], ['$gt', 7, false, true], ['$ge', 8, false, true], ['$lt', 16, false, true],
    ['$le', 3, false, true], ['$gt', 8, true, true], ['$lt', 0, true, true], ['$gt', 5, false, false], ['$ge', 6, false, false], ['$lt', 7, true, true], ['$lt', 6, true, false], ['$le', 4, false, false]]) {
    const n = left ? one(type, bin(c), y) : one(type, y, bin(c));
    assert.deepEqual(sharedComparisons(n, 't'), yes ? ['r'] : [], `${left ? `${c} ${type} y` : `y ${type} ${c}`}`);
  }
  assert.deepEqual(sharedComparisons(one('$gt', y, ['0'], { parameters: { A_SIGNED: '00000000000000000000000000000001', B_SIGNED: '00000000000000000000000000000001' } }), 't'), []);
  assert.deepEqual(sharedComparisons({ modules: {} }, 't'), []);
});

test('cmpProbe: the comparisons of a signal with several constants found by Yosys, not one alone; none on a 6-input-LUT family', async () => {
  const { cmpProbe } = await import('../packages/silinx-fpga/src/synth-open.js');
  const { toVerilog } = await import('../core/synth-verilog.js');
  const { compile, elaborate } = await import('../core/compile.js');
  const V = `module t(input [8:0] x, input [8:0] z, output a, output b, output c);
  assign a = x > 9'd99; assign b = x < 9'd40; assign c = z > 9'd77;
endmodule
`;
  const { text, top } = toVerilog(elaborate(compile([{ path: 't.v', lang: 'verilog', text: V }]), 't'));
  const found = await cmpProbe(top, text, 'spartan3e', yosysNode);
  assert.equal(found.length, 2);
  assert.ok(found.every(n => /^\$(gt|lt)\$/.test(n)), found.join(' '));
  assert.deepEqual(await cmpProbe(top, text, 'spartan6', yosysNode), []);
});

test('keepCmp: fewer slices, the gain at least the loss in speed by the estimate (the corpus\'s estimates with and without)', () => {
  // [estimate ns, slices] as before and with the comparisons as logic
  for (const [name, n, sl, yes] of [['itc99-b05', [9.53, 10.29], [255, 194], true], ['verilog-uart', [6.92, 5.77], [125, 119], true],
    ['itc99-b11', [7.91, 7.46], [100, 94], true], ['itc99-b15', [18.51, 17.4], [1303, 1317], false], ['secworks-sha1', [14.18, 16.12], [979, 934], false],
    ['verilog-i2c-master', [8.85, 8.38], [114, 121], false], ['itc99-b22', [34.26, 35.79], [2030, 1949], false], ['same', [10, 10], [100, 100], false],
    ['no slices', [10, 9], [100, NaN], false]]) assert.equal(keepCmp(n, sl), yes, name);
});

test('cmpChoice: the one kept, r.depth.cmp said on it; a candidate that failed, the base', () => {
  const r = (ns, slices, luts) => ({ ns, slices, util: { luts }, depth: { tried: true } });
  const measure = x => [x.ns, x.slices];
  const base = r(9.53, 255, 282), cand = r(10.29, 194, 272);
  assert.deepEqual(cmpChoice(base, cand, 27, measure), { ...cand, depth: { tried: true, cmp: { comparisons: 27, kept: true, ns: 10.29, luts: 272, slices: 194 } } });
  const worse = r(17.4, 1317, 1907);
  assert.deepEqual(cmpChoice(base, worse, 4, measure).depth.cmp, { comparisons: 4, kept: false, ns: 17.4, luts: 1907, slices: 1317 });
  assert.equal(cmpChoice(base, worse, 4, measure).ns, 9.53);
  assert.deepEqual(cmpChoice(base, null, 4, measure), { ...base, depth: { tried: true, cmp: { comparisons: 4, kept: false } } });
});

test('probeComparisons: no family or no comparison, no run; a run that fails or writes nothing, none', async () => {
  let runs = 0;
  const count = async () => { runs++; return {}; };
  assert.deepEqual(await probeComparisons('t', 'module t; assign a = b > 3; endmodule', null, count), []);
  assert.deepEqual(await probeComparisons('t', 'module t; always @(posedge c) q <= d; endmodule', 'xc3se', count), []);
  assert.equal(runs, 0);
  assert.deepEqual(await probeComparisons('t', 'module t; assign a = b > 3; endmodule', 'xc3se', count), []);
  assert.equal(runs, 1);
  assert.deepEqual(await probeComparisons('t', 'module t; assign a = b > 3; endmodule', 'xc3se', async () => { throw new Error('crash'); }), []);
});

// #3097: a 9-bit signal compared with ten constants (as itc99's b05 compares TM with 99, 89, …), in Verilog and in VHDL.
// On carry chains (synth_xilinx's cmp2lcu): 30 MUXCY, 26 LUTs, 27 slices; as logic: no carry, 22 LUTs, 11 slices.
const CMP_V = `module cmpc(input clk, input signed [8:0] x, output reg [9:0] d);
  integer i;
  always @(posedge clk) for (i = 0; i < 10; i = i + 1) d[i] <= x > 10 * i - 5;
endmodule
`;
const CMP_VHD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cmpc is port (clk : in std_logic; x : in signed(8 downto 0); d : out std_logic_vector(9 downto 0)); end;
architecture rtl of cmpc is
begin
  process (clk) begin
    if rising_edge(clk) then
      for i in 0 to 9 loop
        if x > 10 * i - 5 then d(i) <= '1'; else d(i) <= '0'; end if;
      end loop;
    end if;
  end process;
end;
`;
for (const [lang, file, text] of [['Verilog', 'cmpc.v', CMP_V], ['VHDL', 'cmpc.vhd', CMP_VHD]]) {
  test(`#3097 ${lang}: a signal compared with ten constants as LUTs, no carry chain, 11 slices, no warnings; the netlist simulates as the RTL`, { timeout: 120000 }, async () => {
    const { compile, elaborate } = await import('../core/compile.js');
    const { synthesizeOpen } = await import('../core/synth-front.js');
    const { readYosysJson } = await import('../packages/silinx-fpga/src/fpga/netlist.js');
    const { pack } = await import('../packages/silinx-fpga/src/fpga/pack.js');
    const { diffSynth } = await import('./diff-synth.js');
    const src = { path: file, lang: lang.toLowerCase(), text };
    const lib = compile([src]);
    const design = elaborate(lib, 'cmpc');
    assert.deepEqual([...lib.errors, ...design.diags].map(d => d.message), []);
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.deepEqual(r.warnings, []);
    // (the synthesis with them as logic kept against the one as before: fewer slices, no slower)
    assert.equal(r.depth.cmp.comparisons, 10);
    assert.equal(r.depth.cmp.kept, true, JSON.stringify(r.depth.cmp));
    assert.equal(r.util.carry, 0);
    assert.ok(r.util.luts <= 22, `${r.util.luts} LUTs`);
    const packed = pack(readYosysJson(r.files[`${r.top}.json`]));
    assert.deepEqual(packed.warnings, []);
    assert.ok(packed.stats.slices <= 11, `${packed.stats.slices} slices`);
    const d = await diffSynth({ name: `cmpc-${lang}`, top: 'cmpc', sim: { cycles: 300 }, sources: [src] });
    assert.equal(d.status, 'pass', d.report || `${d.stage}: ${d.reason}`);
    assert.deepEqual(d.warnings, []);
  });
}

test('#3097 a comparison alone keeps its carry chain (as logic, a wide one is slower: the T80\'s)', { timeout: 120000 }, async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const design = elaborate(compile([{ path: 'one.v', lang: 'verilog', text: 'module one(input clk, input [8:0] x, output reg d); always @(posedge clk) d <= x > 9\'d99; endmodule\n' }]), 'one');
  const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
  assert.deepEqual(r.warnings, []);
  assert.ok(r.util.carry > 0, JSON.stringify(r.util));
});
