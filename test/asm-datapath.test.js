// Tests for the data-path features of ASM charts (core/asm.js + core/asm-from-hdl.js):
// generics, internal registers, synchronised inputs, every-cycle blocks and the << >> operators.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeModel, validate, generate, parseCondition, extractAlwaysBlocks, asmJoinPoints } from '../core/asm.js';
import { asmFromHdl, asmLayout, sameAsmStructure, nodeSize } from '../core/asm-from-hdl.js';
import { simulate } from '../core/compile.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLINKY = path.join(ROOT, 'examples', 'blinky');
const clone = (o) => JSON.parse(JSON.stringify(o));
const errorsOf = (m) => validate(m).filter((d) => d.severity === 'error');

// ---------------------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------------------

/** The blinky example: button synchronisers + debouncers + speed FSM + step divider. */
// the blinky chart, with the reset speed level pinned to 3 (the example's own value may be tuned)
const speedCtrl = () => {
  const m = JSON.parse(fs.readFileSync(path.join(BLINKY, 'src', 'speed_ctrl.asm.json'), 'utf8'));
  for (const r of m.registers || []) if (r.name === 'level') r.init = '3';
  return m;
};

/** Shifts and Verilog sizing in every context, a generic in arithmetic, a joined branch. */
function shifter() {
  return {
    version: 1, name: 'shifter', lang: 'verilog', clock: 'clk', reset: { name: 'rst', active: 'high', sync: false }, encoding: 'binary',
    generics: [{ name: 'K', default: 5 }, { name: 'LIM', default: 200 }],
    inputs: [{ name: 'a', width: 8 }, { name: 'n', width: 3 }, { name: 'b', width: 4 }, { name: 'go', width: 1, sync: true }],
    outputs: [
      { name: 'y', width: 8, default: '0' }, { name: 'z', width: 4, default: '0' }, { name: 'f', width: 1, default: '0' },
      { name: 'hi', width: 8, default: '0', registered: true },
    ],
    registers: [{ name: 'acc', width: 8, init: '0' }, { name: 'sh', width: 3, init: '1' }, { name: 'wide', width: 12, init: "12'hFFF" }],
    nodes: [
      { id: 's1', type: 'state', name: 'IDLE', actions: [] },
      { id: 'd1', type: 'decision', cond: 'go' },
      { id: 's2', type: 'state', name: 'RUN', actions: ['y = a << sh', 'hi = (acc + 1) >> 1'] },
      { id: 'd2', type: 'decision', cond: '(a << n) > 8\'d200 || acc >= LIM' },
      { id: 'o1', type: 'output', actions: ['z = b >> 1', 'acc = acc + K'] },
      { id: 'a1', type: 'always', name: 'calc', actions: ['y = (a + 1) >> 1', 'wide = ~b'] },
      { id: 'd3', type: 'decision', cond: 'a >> n == 0' },
      { id: 'o2', type: 'output', actions: ['f = 1', 'sh = sh + 1'] },
      { id: 'o3', type: 'output', actions: ['z = (1 << n) - 1'] },
      { id: 'd4', type: 'decision', cond: "(b - 1) >> 1 == 4'd7" },
      { id: 'o4', type: 'output', actions: ['acc = (acc << 1) | 1'] },
    ],
    edges: [
      { from: 's1', to: 'd1' }, { from: 'd1', to: 's2', port: 'true' }, { from: 'd1', to: 's1', port: 'false' },
      { from: 's2', to: 'd2' }, { from: 'd2', to: 'o1', port: 'true' }, { from: 'd2', to: 's2', port: 'false' }, { from: 'o1', to: 's1' },
      // every-cycle block: d3 -> o2 (1) / nothing (0), both join at o3; then d4 with only a 1 branch
      { from: 'a1', to: 'd3' }, { from: 'd3', to: 'o2', port: 'true' }, { from: 'd3', to: 'o3', port: 'false' },
      { from: 'o2', to: 'o3' }, { from: 'o3', to: 'd4' }, { from: 'd4', to: 'o4', port: 'true' },
    ],
    initial: 's1',
  };
}

/** Priority: the state's assignments win over the every-cycle block; two blocks; Mealy outputs. */
function priority() {
  return {
    version: 1, name: 'prio', lang: 'vhdl', clock: 'clk', reset: { name: 'rst_n', active: 'low', sync: true }, encoding: 'onehot',
    inputs: [{ name: 'x', width: 1 }, { name: 'y', width: 1 }],
    outputs: [{ name: 'm', width: 1, default: '0' }, { name: 'q', width: 2, default: '0' }, { name: 'cnt', width: 4, default: '9', registered: true }],
    registers: [{ name: 'last', width: 1, init: '1' }],
    nodes: [
      { id: 's1', type: 'state', name: 'A', actions: ['q = 3'] },
      { id: 'd1', type: 'decision', cond: 'x' },
      { id: 's2', type: 'state', name: 'B', actions: [] },
      { id: 'd2', type: 'decision', cond: 'y && last' },
      { id: 'o1', type: 'output', actions: ['cnt = 0', 'm = 1'] },
      { id: 'a1', type: 'always', name: 'track', actions: ['m = x ^ y', 'last = y'] },
      { id: 'd3', type: 'decision', cond: 'x' },
      { id: 'o2', type: 'output', actions: ['q = 1'] },
      { id: 'd5', type: 'decision', cond: 'y' },
      { id: 'o3', type: 'output', actions: ['q = 2'] },
      { id: 'a2', type: 'always', name: 'count', actions: [] },
      { id: 'd4', type: 'decision', cond: "cnt != 4'd15" },
      { id: 'o4', type: 'output', actions: ['cnt = cnt + 1'] },
    ],
    edges: [
      { from: 's1', to: 'd1' }, { from: 'd1', to: 's2', port: 'true' }, { from: 'd1', to: 's1', port: 'false' },
      { from: 's2', to: 'd2' }, { from: 'd2', to: 'o1', port: 'true' }, { from: 'd2', to: 's2', port: 'false' }, { from: 'o1', to: 's1' },
      { from: 'a1', to: 'd3' }, { from: 'd3', to: 'o2', port: 'true' }, { from: 'd3', to: 'd5', port: 'false' },
      { from: 'd5', to: 'o3', port: 'true' },
      { from: 'a2', to: 'd4' }, { from: 'd4', to: 'o4', port: 'true' },
    ],
    initial: 's1',
  };
}

const MODELS = { speedCtrl, shifter, priority };
const ENCS = ['binary', 'gray', 'onehot', 'enum'];
const PARAMS = { speedCtrl: { DEBOUNCE: 2 }, shifter: { K: 3 }, priority: {} };

// ---------------------------------------------------------------------------------------
// Simulation helpers: random stimulus through a Verilog testbench, outputs sampled per cycle
// ---------------------------------------------------------------------------------------

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }

function testbench(m, { cycles, seed, lower, params = {}, vectors = null }) {
  const nm = (s) => (lower ? s.toLowerCase() : s);
  const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const on = m.reset.active === 'high' ? 1 : 0;
  const r = rng(seed);
  const L = ['module tb;', `  reg clk = 0; reg rst = ${on};`];
  for (const i of m.inputs) L.push(`  reg ${vec(i.width)}i_${i.name} = 0;`);
  for (const o of m.outputs) L.push(`  wire ${vec(o.width)}o_${o.name};`);
  const conns = [`.${nm(m.clock)}(clk)`, `.${nm(m.reset.name)}(rst)`,
    ...m.inputs.map((i) => `.${nm(i.name)}(i_${i.name})`), ...m.outputs.map((o) => `.${nm(o.name)}(o_${o.name})`)];
  const ps = Object.entries(params).map(([k, v]) => `.${nm(k)}(${v})`).join(', ');
  L.push(`  ${nm(m.name)} ${ps ? `#(${ps}) ` : ''}dut(${conns.join(', ')});`, '  always #5 clk = ~clk;', '  initial begin', `    #12 rst = ${1 - on};`);
  const fmt = m.outputs.map(() => '%b').join('_');
  const cur = {};
  const n = vectors ? vectors.length : cycles;
  for (let c = 0; c < n; c++) {
    const asg = m.inputs.map((i) => {
      if (vectors) cur[i.name] = vectors[c][i.name] ?? 0;
      else if (cur[i.name] == null || r() % 3 === 0) cur[i.name] = r() % (1 << i.width); // inputs stay stable for a few cycles
      return `i_${i.name} = ${i.width}'d${cur[i.name]};`;
    }).join(' ');
    L.push(`    ${asg} #3 $display("${fmt}", ${m.outputs.map((o) => `o_${o.name}`).join(', ')}); @(posedge clk); #1;`);
  }
  L.push('    $finish;', '  end', 'endmodule');
  return L.join('\n');
}

function runSim(code, lang, m, opts = {}) {
  const tb = testbench(m, { cycles: 300, seed: 7, lower: lang === 'vhdl', ...opts });
  const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e8 });
  assert.deepEqual(r.errors, [], `${lang} simulation errors`);
  const out = r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz_]+$/.test(s));
  assert.equal(out.length, opts.vectors ? opts.vectors.length : 300);
  return out;
}

function overlaps(model) {
  const out = [];
  for (let i = 0; i < model.nodes.length; i++) {
    for (let j = i + 1; j < model.nodes.length; j++) {
      const a = model.nodes[i], b = model.nodes[j];
      const A = nodeSize(a), B = nodeSize(b);
      if (Math.abs(a.x - b.x) * 2 < A.w + B.w && Math.abs(a.y - b.y) * 2 < A.h + B.h) out.push(`${a.id}/${b.id}`);
    }
  }
  return out;
}
const headerless = (code) => code.split('\n').filter((l) => !/^(--|\/\/)/.test(l)).join('\n');

// ---------------------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------------------

test('normalizeModel: old charts are unchanged, new fields are normalised', () => {
  const old = {
    version: 1, name: 'f', lang: 'vhdl', clock: 'clk', reset: { name: 'rst' }, encoding: 'binary',
    inputs: [{ name: 'a', width: 1 }], outputs: [{ name: 'o', width: 1, default: '0' }],
    nodes: [{ id: 's1', type: 'state', name: 'S', x: 1, y: 2, actions: [] }], edges: [{ id: 'e1', from: 's1', to: 's1', port: 'next' }],
    initial: 's1', generatedFile: 'src/f.vhd', base: 'hdl',
  };
  const n = normalizeModel(old);
  assert.deepEqual(Object.keys(n), ['version', 'name', 'lang', 'clock', 'reset', 'encoding', 'inputs', 'outputs', 'nodes', 'edges', 'initial', 'generatedFile', 'base']);
  assert.deepEqual(n.inputs, [{ name: 'a', width: 1 }]);
  assert.deepEqual(normalizeModel(n), n);

  const m = normalizeModel({
    ...old,
    generics: [{ name: 'N', default: '1_000' }, { name: 'B', default: 'x' }],
    inputs: [{ name: 'a', width: 1, sync: 1 }, { name: 'c', width: 2, sync: false }],
    registers: [{ name: 'r', width: '4' }, { name: 'q', width: 2, init: "2'b10" }],
    nodes: [...old.nodes, { id: 'a1', type: 'always', name: 'blk', actions: 'x = 1\n\ny = 2' }],
  });
  assert.deepEqual(m.generics, [{ name: 'N', default: 1000 }, { name: 'B', default: 'x' }]);
  assert.deepEqual(m.inputs, [{ name: 'a', width: 1, sync: true }, { name: 'c', width: 2 }]);
  assert.deepEqual(m.registers, [{ name: 'r', width: 4, init: '0' }, { name: 'q', width: 2, init: "2'b10" }]);
  assert.deepEqual(m.nodes[1], { id: 'a1', type: 'always', x: 0, y: 0, name: 'blk', actions: ['x = 1', 'y = 2'] });
  assert.equal(m.generatedFile, 'src/f.vhd');
  assert.equal(m.base, 'hdl');
});

test('expression parser: << and >> (precedence between comparisons and + -)', () => {
  const p = (s) => parseCondition(s).ast;
  assert.deepEqual(p('a << 1 + b'), { k: 'bin', op: '<<', a: { k: 'id', name: 'a' }, b: { k: 'bin', op: '+', a: { k: 'lit', v: 1n, w: null, base: 'd' }, b: { k: 'id', name: 'b' } } });
  assert.equal(p('a >> n == 0').op, '==');
  assert.equal(p('x <= y >> 2').op, '<=');
});

// ---------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------

test('the example charts are valid', () => {
  for (const [name, make] of Object.entries(MODELS)) assert.deepEqual(errorsOf(make()), [], name);
});

test('validation: names, assignments and widths of the new features', () => {
  const msgs = (m) => errorsOf(m).map((d) => d.message).join('\n');
  const m = shifter();
  const bad = (mut) => { const x = clone(m); mut(x); return msgs(x); };
  assert.match(bad((x) => { x.nodes.find((n) => n.id === 'd3').cond = 'foo == 1'; }), /'foo' is not a declared input, register or generic/);
  assert.match(bad((x) => { x.nodes.find((n) => n.id === 'o2').actions = ['a = 1']; }), /'a' is an input and cannot be assigned/);
  assert.match(bad((x) => { x.nodes.find((n) => n.id === 'o2').actions = ['K = 1']; }), /'K' is a generic \(a constant\) and cannot be assigned/);
  assert.match(bad((x) => { x.nodes.find((n) => n.id === 'o2').actions = ['nope = 1']; }), /'nope' is not a declared output or register/);
  assert.match(bad((x) => { x.registers[0].width = 0; }), /Register 'acc' has invalid width 0/);
  assert.match(bad((x) => { x.registers[0].name = 'go_sync'; }), /Register 'go_sync' clashes with synchroniser flip-flop 'go_sync'/);
  assert.match(bad((x) => { x.registers[0].name = 'a'; }), /Register 'a' clashes with input 'a'/);
  assert.match(bad((x) => { x.registers[1].init = 'zz'; }), /Register 'sh': reset value 'zz' must be a literal/);
  assert.match(bad((x) => { x.generics[0].default = -1; }), /Generic 'K': default value '-1' must be a non-negative integer/);
  assert.match(bad((x) => { x.generics[0].name = 'signal'; }), /Generic 'signal' is a reserved word/);
  assert.match(bad((x) => { x.nodes.find((n) => n.id === 'o2').actions = ['f = (a == 1) << 2']; }), /'<<' cannot be applied to a boolean/);
  assert.match(bad((x) => { x.nodes.find((n) => n.id === 'o2').actions = ['f = acc']; }), /cannot assign a 8-bit value to a 1-bit target/);
  assert.match(bad((x) => { x.nodes.find((n) => n.id === 'o2').actions = ['acc = K & 3']; }), /'&' cannot combine generics and literals only/);
  assert.match(bad((x) => { x.nodes.find((n) => n.id === 'a1').name = ''; }), /Every-cycle block has no name/);
  assert.match(bad((x) => { x.nodes.push({ id: 'a9', type: 'always', name: 'calc', actions: [] }); }), /Duplicate every-cycle block name 'calc'/);
  // a combinational output cannot be read, not even in an every-cycle block
  assert.match(bad((x) => { x.nodes.find((n) => n.id === 'd3').cond = 'y == 0'; }), /output 'y' is combinational and cannot be read/);
});

test('validation: structure of every-cycle blocks', () => {
  const m = shifter();
  const msgs = (mut) => { const x = clone(m); mut(x); return errorsOf(x).map((d) => d.message).join('\n'); };
  // a path that reaches a state
  assert.match(msgs((x) => { x.edges.push({ from: 'o4', to: 's1' }); }), /Every-cycle block 'calc': a path reaches state 'IDLE'/);
  // a loop
  assert.match(msgs((x) => { x.edges.push({ from: 'o4', to: 'd3' }); }), /Every-cycle block 'calc': loop through decision\/output boxes/);
  // entering the header
  assert.match(msgs((x) => { x.edges.push({ from: 'o4', to: 'a1' }); }), /Every-cycle block 'calc' cannot be entered/);
  assert.match(msgs((x) => { x.edges.find((e) => e.from === 'o1').to = 'a1'; }), /cannot be entered/);
  // a box shared by a state block and an every-cycle block
  assert.match(msgs((x) => { x.edges.find((e) => e.from === 'd2' && e.port === 'false').to = 'o3'; }), /belongs both to the block of state 'RUN' and to Every-cycle block 'calc'/);
  // two blocks assigning the same target
  assert.match(msgs((x) => {
    x.nodes.push({ id: 'a2', type: 'always', name: 'other', actions: ['z = 0'] });
  }), /'z' is assigned by the every-cycle blocks 'calc' and 'other'/);
  // unconnected exits are the end of the block (no error), but not in a state block
  assert.deepEqual(errorsOf(m), []);
  assert.match(msgs((x) => { x.edges = x.edges.filter((e) => !(e.from === 'd2' && e.port === 'false')); }), /Decision '.*' has no 0 \(false\) branch/);
  // a box reachable from nothing is a warning
  const x = clone(m);
  x.nodes.push({ id: 'o9', type: 'output', actions: ['z = 1'] });
  assert.ok(validate(x).some((d) => d.severity === 'warning' && /cannot be reached from any state or every-cycle block/.test(d.message)));
});

// ---------------------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------------------

test('VHDL: generics, registers, synchronisers, every-cycle blocks before the state logic', () => {
  const code = generate(speedCtrl(), 'vhdl').code;
  assert.match(code, /entity speed_ctrl is\n {4}generic \(\n {8}DEBOUNCE : integer := 1000000\n {4}\);\n {4}port \(/);
  assert.match(code, /-- Generics {4}: DEBOUNCE = 1000000/);
  assert.match(code, /-- Every cycle \(in parallel with the states; the state's assignments take priority\):\n-- {3}debounce_faster : \(faster != deb_f\) && \(cnt_f == DEBOUNCE - 1\) {2}\[cnt_f = 0, deb_f = faster\]/);
  assert.match(code, /signal cnt_f, cnt_f_next : std_logic_vector\(19 downto 0\);/);
  assert.match(code, /signal faster_meta, faster_sync : std_logic;/);
  assert.match(code, /faster_meta <= '0';\n\s+faster_sync <= '0';/);
  assert.match(code, /faster_meta <= faster;\n\s+faster_sync <= faster_meta;/);
  assert.match(code, /level <= "011";/);
  assert.match(code, /if faster_sync \/= deb_f then\n\s+if unsigned\(cnt_f\) = \(DEBOUNCE - 1\) then/);
  assert.match(code, /if unsigned\(ticks\) >= \(shift_left\(to_unsigned\(1, 32\), to_integer\(unsigned\(level\)\)\) - 1\) then/);
  const out = code.slice(code.indexOf('output_logic : process'));
  assert.ok(out.indexOf('-- every cycle: divider') < out.indexOf('case state_reg is'), 'every-cycle blocks come before the state logic');
  assert.match(out, /output_logic : process \(state_reg, faster_sync, slower_sync, tick, step_reg, cnt_f, deb_f, cnt_s, deb_s, level, ticks\)/);
  assert.doesNotMatch(code, /DEBOUNCE[,)]/); // a generic is not a signal: not in sensitivity lists
});

test('Verilog: parameters, registers, synchronisers, every-cycle blocks before the state logic', () => {
  const code = generate(speedCtrl(), 'verilog').code;
  assert.match(code, /module speed_ctrl #\(\n {4}parameter DEBOUNCE = 1000000\n\) \(/);
  assert.match(code, /reg \[19:0\] cnt_f, cnt_f_next;/);
  assert.match(code, /reg faster_meta, faster_sync;/);
  assert.match(code, /level <= 3'd3;/);
  assert.match(code, /if \(ticks >= \(\(1 << level\) - 1\)\) begin/);
  const out = code.slice(code.indexOf('output and register logic'));
  assert.ok(out.indexOf('// every cycle: divider') < out.indexOf('case (state_reg)'));
});

test('VHDL follows the Verilog sizing of shifts, ~ and arithmetic in comparisons', () => {
  const code = generate(shifter(), 'vhdl').code;
  // (a + 1) >> 1 is evaluated at 32 bits in Verilog (the unsized 1): the carry is kept
  assert.match(code, /y <= std_logic_vector\(resize\(shift_right\(\(resize\(unsigned\(a\), 32\) \+ 1\), 1\), 8\)\);/);
  // ~b is extended to the 12-bit target before it is inverted
  assert.match(code, /wide_next <= std_logic_vector\(not resize\(unsigned\(b\), 12\)\);/);
  // shift by a register, of an unsized literal, inside a comparison with a generic
  assert.match(code, /y <= std_logic_vector\(shift_left\(unsigned\(a\), to_integer\(unsigned\(sh\)\)\)\);/);
  assert.match(code, /if \(shift_left\(unsigned\(a\), to_integer\(unsigned\(n\)\)\) > 200\) or \(unsigned\(acc\) >= LIM\) then/);
  assert.match(code, /acc_next <= std_logic_vector\(unsigned\(acc\) \+ K\);/);
  // the joined branch is emitted once, after the if
  const blk = code.slice(code.indexOf('-- every cycle: calc'), code.indexOf('-- state logic'));
  assert.equal(blk.match(/z <= /g).length, 1);
  assert.match(blk, /end if;\n {8}z <= /);
});

test('generated VHDL and Verilog simulate the same (random stimulus, generics overridden)', () => {
  for (const [name, make] of Object.entries(MODELS)) {
    for (const encoding of ['binary', 'onehot']) {
      const m = { ...make(), encoding };
      const v = runSim(generate(m, 'vhdl').code, 'vhdl', m, { params: PARAMS[name], seed: 3 });
      assert.ok(v.filter((l, i) => i && l !== v[i - 1]).length > 10, `${name}: the stimulus exercises the design`);
      assert.deepEqual(runSim(generate(m, 'verilog').code, 'verilog', m, { params: PARAMS[name], seed: 3 }), v, `${name}/${encoding}`);
    }
  }
});

test('simulation: Verilog widths of shifts, the 2-FF synchroniser delay and the priority of the state', () => {
  // y = (a + 1) >> 1 keeps the carry; wide = ~b sets the upper bits
  const m = shifter();
  const vec = [{ a: 255, b: 0 }, { a: 255, b: 0 }, { a: 7, b: 5 }];
  for (const lang of ['vhdl', 'verilog']) {
    const out = runSim(generate(m, lang).code, lang, m, { vectors: vec });
    // outputs y_z_f_hi; state IDLE (go is 0), comb y from the every-cycle block
    assert.equal(out[0].split('_')[0], '10000000', `${lang}: (255 + 1) >> 1 = 128`);
    assert.equal(out[2].split('_')[0], '00000100', `${lang}: (7 + 1) >> 1 = 4`);
  }
  // priority: in state A the Moore q = 3 overrides the block's q = 1 / 2
  const p = priority();
  const vecs = [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
  for (const lang of ['vhdl', 'verilog']) {
    const out = runSim(generate(p, lang).code, lang, p, { vectors: vecs });
    // m_q: in state A (3 cycles) m = x ^ y from the block and q = 3 from the state (the block's
    // q = 1 / 2 is overridden); in B the block's q, and m = 1 from the state path when y && last
    assert.deepEqual(out.map((l) => l.split('_').slice(0, 2).join('_')), ['1_11', '0_11', '1_11', '1_10', '1_01'], lang);
  }
  // the synchroniser delays go by two clock edges: IDLE -> RUN two cycles after go rises
  const g = [...Array(6)].map((_, i) => ({ go: i >= 1 ? 1 : 0, a: 1 }));
  for (const lang of ['vhdl', 'verilog']) {
    const out = runSim(generate(m, lang).code, lang, m, { vectors: g });
    // in RUN the Moore y = a << sh (1 << 1 = 2) overrides the block's y = (a + 1) >> 1 = 1
    assert.deepEqual(out.map((l) => l.split('_')[0]), ['00000001', '00000001', '00000001', '00000001', '00000010', '00000010'], lang);
  }
});

// ---------------------------------------------------------------------------------------
// HDL -> chart
// ---------------------------------------------------------------------------------------

test('round trip: generate -> asmFromHdl -> generate is identical (new features, all encodings, both languages)', () => {
  for (const [name, make] of Object.entries(MODELS)) {
    for (const lang of ['vhdl', 'verilog']) {
      for (const encoding of ENCS) {
        const m = { ...make(), encoding };
        const code = generate(m, lang).code;
        const { model, warnings } = asmFromHdl(code, { lang });
        const where = `${name}/${lang}/${encoding}`;
        assert.deepEqual(warnings, [], where);
        assert.ok(sameAsmStructure(model, m), `${where}: structure differs`);
        assert.equal(generate(model, lang).code, code, `${where}: regenerated HDL differs`);
        assert.deepEqual(errorsOf(model), [], where);
        assert.deepEqual(overlaps(model), [], `${where}: overlapping boxes`);
        assert.deepEqual(model.generics || [], normalizeModel(m).generics || [], where);
        assert.deepEqual(model.inputs, normalizeModel(m).inputs, where);
        assert.deepEqual(model.nodes.filter((n) => n.type === 'always').map((n) => [n.name, n.actions]),
          normalizeModel(m).nodes.filter((n) => n.type === 'always').map((n) => [n.name, n.actions]), where);
      }
    }
  }
});

test('round trip without the generator header, and the regenerated HDL simulates the same', () => {
  for (const [name, make] of Object.entries(MODELS)) {
    for (const lang of ['vhdl', 'verilog']) {
      const m = make();
      const code = generate(m, lang).code;
      const { model } = asmFromHdl(headerless(code), { lang });
      assert.equal(headerless(generate(model, lang).code), headerless(code), `${name}/${lang}`);
      const other = lang === 'vhdl' ? 'verilog' : 'vhdl';
      const ref = runSim(code, lang, m, { params: PARAMS[name], seed: 9 });
      assert.deepEqual(runSim(generate(model, other).code, other, m, { params: PARAMS[name], seed: 9 }), ref, `${name}: ${lang} -> ${other}`);
    }
  }
});

test('sameAsmStructure compares registers, generics, synchronisers and every-cycle blocks', () => {
  const a = shifter();
  assert.ok(sameAsmStructure(a, clone(a)));
  const ch = (mut) => { const b = clone(a); mut(b); return sameAsmStructure(a, b); };
  assert.ok(!ch((b) => { b.registers[0].width = 7; }));
  assert.ok(!ch((b) => { b.registers[1].init = '2'; }));
  assert.ok(ch((b) => { b.registers[1].init = "3'b001"; })); // same value
  assert.ok(!ch((b) => { b.generics[0].default = 6; }));
  assert.ok(!ch((b) => { delete b.inputs[3].sync; }));
  assert.ok(!ch((b) => { b.nodes.find((n) => n.id === 'o2').actions = ['f = 1']; }));
  assert.ok(!ch((b) => { b.nodes.find((n) => n.id === 'a1').name = 'calc2'; }));
  // the same behaviour drawn differently: the header action moved into a box below it
  assert.ok(ch((b) => {
    b.nodes.find((n) => n.id === 'a1').actions = ['y = (a + 1) >> 1'];
    b.nodes.push({ id: 'o8', type: 'output', actions: ['wide = ~b'] });
    b.edges.find((e) => e.from === 'a1').from = 'o8';
    b.edges.push({ from: 'a1', to: 'o8' });
  }));
});

test('hand-written HDL: extra registers become internal registers, state-free logic every-cycle blocks', () => {
  const src = `module arb (
    input  wire clk, input wire reset_n, input wire [1:0] req, input wire done,
    output reg [1:0] gnt, output reg idle
);
    localparam IDLE = 2'd0, G0 = 2'd1, G1 = 2'd2;
    parameter LIMIT = 200;
    reg [1:0] cs, ns;
    reg [7:0] free;
    always @(posedge clk or negedge reset_n)
        if (!reset_n) cs <= IDLE;
        else cs <= ns;
    always @(posedge clk or negedge reset_n)
        if (!reset_n) free <= 8'd3;
        else if (free == LIMIT) free <= 0;
        else free <= free + 1;
    always @* begin
        ns = cs; gnt = 2'b00; idle = 1'b0;
        case (cs)
            IDLE: begin
                idle = 1'b1;
                if (req == 2'b01 && free > 8'd100) ns = G0;
                else if (req == 2'b10) ns = G1;
            end
            G0: begin gnt = 2'b01; if (done) ns = IDLE; end
            G1: begin gnt = 2'b10; if (done) ns = IDLE; end
            default: ns = IDLE;
        endcase
    end
endmodule
`;
  const { model, warnings } = asmFromHdl(src, { lang: 'verilog' });
  assert.deepEqual(warnings, []);
  assert.deepEqual(model.registers, [{ name: 'free', width: 8, init: '3' }]);
  assert.deepEqual(model.generics, [{ name: 'LIMIT', default: 200 }]);
  const blocks = extractAlwaysBlocks(model);
  assert.deepEqual(blocks.map((b) => [b.name, b.paths.length]), [['every_cycle', 2]]);
  assert.deepEqual(errorsOf(model), []);
  const ref = runSim(src, 'verilog', model, { params: { LIMIT: 120 } });
  for (const l of ['vhdl', 'verilog']) assert.deepEqual(runSim(generate(model, l).code, l, model, { params: { LIMIT: 120 } }), ref, l);

  // VHDL: a 2-flip-flop synchroniser of an input is recognised as a synchronised input
  const vh = `library ieee; use ieee.std_logic_1164.all;
entity hs is port (clk, rst, btn : in std_logic; led : out std_logic); end;
architecture r of hs is
  type st is (OFF, LIT);
  signal s, n : st;
  signal b1, b2 : std_logic;
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then s <= OFF; b1 <= '0'; b2 <= '0';
      else s <= n; b1 <= btn; b2 <= b1; end if;
    end if;
  end process;
  process (s, b2) begin
    n <= s; led <= '0';
    case s is
      when OFF => if b2 = '1' then n <= LIT; end if;
      when LIT => led <= '1'; if b2 = '0' then n <= OFF; end if;
    end case;
  end process;
end;`;
  const r = asmFromHdl(vh, { lang: 'vhdl' });
  assert.deepEqual(r.model.inputs, [{ name: 'btn', width: 1, sync: true }]);
  assert.equal(r.model.registers, undefined);
  assert.ok(r.model.nodes.some((n) => n.cond === 'btn'));
  const ref2 = runSim(vh, 'vhdl', r.model);
  for (const l of ['vhdl', 'verilog']) assert.deepEqual(runSim(generate(r.model, l).code, l, r.model), ref2, l);
});

test('a previous chart keeps the ids and positions of the every-cycle blocks', () => {
  const prev = normalizeModel(speedCtrl());
  prev.nodes.forEach((n, i) => { if (n.type !== 'state') { n.x += 13 * i; n.y += 7 * i; } });
  const code = generate(prev, 'vhdl').code;
  const { model } = asmFromHdl(code, { lang: 'vhdl', previous: prev });
  assert.deepEqual(model, prev);
  // an action changed by hand in the HDL: the boxes stay where they were
  const edited = code.replace('ticks_next <= std_logic_vector(unsigned(ticks) + 1);', 'ticks_next <= std_logic_vector(unsigned(ticks) + 2);');
  assert.notEqual(edited, code);
  const r = asmFromHdl(edited, { lang: 'vhdl', previous: prev });
  assert.match(r.warnings.join('\n'), /changed by hand/);
  const changed = r.model.nodes.find((n) => n.actions?.includes('ticks = ticks + 2'));
  assert.ok(changed);
  for (const n of prev.nodes) {
    if (n.actions?.includes('ticks = ticks + 1')) { assert.ok(!r.model.nodes.some((x) => x.id === n.id && x.type === 'output' && x !== changed && x.actions.includes('ticks = ticks + 1'))); continue; }
    const k = r.model.nodes.find((x) => x.id === n.id);
    assert.ok(k, n.id);
    assert.deepEqual([k.x, k.y], [n.x, n.y], n.id);
  }
  assert.deepEqual(overlaps(r.model), []);
  assert.deepEqual(errorsOf(r.model), []);
});

test('asmLayout: every-cycle blocks in a column to the right of the state blocks, joins below both branches', () => {
  for (const make of Object.values(MODELS)) {
    const m = asmLayout(normalizeModel(make()));
    assert.deepEqual(overlaps(m), []);
    const right = Math.max(...m.nodes.filter((n) => !isAlwaysPart(m, n.id)).map((n) => n.x + nodeSize(n).w / 2));
    const blk = m.nodes.filter((n) => isAlwaysPart(m, n.id));
    assert.ok(blk.length);
    assert.ok(blk.every((n) => n.x - nodeSize(n).w / 2 > right), 'right of the states');
    const heads = m.nodes.filter((n) => n.type === 'always');
    assert.equal(new Set(heads.map((n) => n.x)).size, 1, 'headers on one vertical line');
  }
  const m = asmLayout(normalizeModel(shifter()));
  const at = (id) => m.nodes.find((n) => n.id === id);
  assert.ok(at('o3').y > at('o2').y && at('o3').x === at('d3').x, 'the join box is below the branches');
  const join = asmJoinPoints(m);
  assert.equal(join('d3'), 'o3');
  assert.equal(join('d4'), null);
});

function isAlwaysPart(m, id) {
  const n = m.nodes.find((x) => x.id === id);
  if (n.type === 'always') return true;
  if (n.type === 'state') return false;
  const seen = new Set();
  const up = (x) => {
    if (seen.has(x)) return false;
    seen.add(x);
    return m.edges.filter((e) => e.to === x).some((e) => { const f = m.nodes.find((k) => k.id === e.from); return f.type === 'always' || (f.type !== 'state' && up(f.id)); });
  };
  return up(id);
}

// ---------------------------------------------------------------------------------------
// The blinky example
// ---------------------------------------------------------------------------------------

test('blinky example: the chart generates speed_ctrl.vhd, which round-trips and passes the test bench', () => {
  const m = JSON.parse(fs.readFileSync(path.join(BLINKY, 'src', 'speed_ctrl.asm.json'), 'utf8'));
  assert.equal(m.generatedFile, 'src/speed_ctrl.vhd');
  assert.deepEqual(validate(m), []);
  const file = fs.readFileSync(path.join(BLINKY, 'src', 'speed_ctrl.vhd'), 'utf8');
  assert.equal(generate(m, 'vhdl').code, file);
  const { model, warnings } = asmFromHdl(file, { path: 'src/speed_ctrl.vhd', previous: m });
  assert.deepEqual(warnings, []);
  assert.deepEqual(model, normalizeModel(m));
  const pj = JSON.parse(fs.readFileSync(path.join(BLINKY, 'xailinx.json'), 'utf8'));
  assert.ok(!pj.files.some((f) => /speed_fsm/.test(f.path)));
  const sources = pj.files.map((f) => ({ path: f.path, text: fs.readFileSync(path.join(BLINKY, f.path), 'utf8') }));
  const r = simulate(sources, pj.simTop, { until: 2e8 });
  assert.deepEqual(r.errors, []);
  const log = r.sim.log.map((e) => `${e.kind}: ${e.text}`);
  assert.ok(log.some((l) => /Simulation finished OK/.test(l)), log.join('\n'));
  assert.ok(!r.sim.log.some((e) => e.kind === 'error' || e.kind === 'failure'), log.join('\n'));
});
