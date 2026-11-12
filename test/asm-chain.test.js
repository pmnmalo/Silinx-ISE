// A chain of decisions in an ASM chart (#3554): each decision's branches meet again at the next one, so the block has 2^n
// paths. The chart is walked in the boxes' time (its subtrees shared), validated, generated (the branches written up to
// where they meet again once the block is large), simulated as the chart says; what has to list the paths one by one
// (the header, the conversion to a state diagram) says how many there are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asmJoinPoints, extractAlwaysBlocks, extractTransitions, generate, validate } from '../core/asm.js';
import { asmToFsm } from '../core/fsm-asm.js';
import { simulate } from '../core/compile.js';
import { simulateAsm } from '../core/asm-sim.js';

/**
 * The chain of n decisions in the block of state A: decision i tests a[i % 4]; its 1 branch y = i % 256, its 0 branch
 * z = i % 2; both meet at decision i + 1; the last goes to B (1) or A (0). escape: the 0 branch tests b first, and goes
 * to state C when it is 0 (the branches then meet again only on some paths: no join point).
 */
function chain(n, { escape = false } = {}) {
  const nodes = [{ id: 'sA', type: 'state', name: 'A', actions: [] }, { id: 'sB', type: 'state', name: 'B', actions: ['w = 1'] },
    ...(escape ? [{ id: 'sC', type: 'state', name: 'C', actions: ['w = 1', 'y = 255'] }] : [])];
  const edges = [{ from: 'sA', to: 'd0' }, { from: 'sB', to: 'sA' }, ...(escape ? [{ from: 'sC', to: 'sA' }] : [])];
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n ? `d${i + 1}` : null;
    nodes.push({ id: `d${i}`, type: 'decision', cond: `a[${i % 4}]` }, { id: `t${i}`, type: 'output', actions: [`y = ${i % 256}`] },
      { id: `f${i}`, type: 'output', actions: [`z = ${i % 2}`] });
    edges.push({ from: `d${i}`, to: `t${i}`, port: 'true' }, { from: `t${i}`, to: next ?? 'sB' });
    if (escape) {
      nodes.push({ id: `e${i}`, type: 'decision', cond: 'b' });
      edges.push({ from: `d${i}`, to: `e${i}`, port: 'false' }, { from: `e${i}`, to: `f${i}`, port: 'true' }, { from: `e${i}`, to: 'sC', port: 'false' });
    } else edges.push({ from: `d${i}`, to: `f${i}`, port: 'false' });
    edges.push({ from: `f${i}`, to: next ?? 'sA' });
  }
  return {
    version: 1, name: 'chain', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'high', sync: true }, encoding: 'binary',
    inputs: [{ name: 'a', width: 4 }, ...(escape ? [{ name: 'b', width: 1 }] : [])],
    outputs: [{ name: 'y', width: 8, default: '0' }, { name: 'z', width: 1, default: '0' }, { name: 'w', width: 1, default: '0' }],
    nodes, edges, initial: 'sA',
  };
}
/** The same chain in an every-cycle block (the state A only counts). */
function alwaysChain(n) {
  const m = chain(n);
  m.registers = [{ name: 'cnt', width: 8, init: '0' }];
  m.nodes = [{ id: 'sA', type: 'state', name: 'A', actions: ['cnt = cnt + 1'] }, { id: 'h', type: 'always', name: 'outs', actions: ['w = 1'] },
    ...m.nodes.filter((x) => !x.type.startsWith('st'))];
  m.edges = [{ from: 'sA', to: 'sA' }, { from: 'h', to: 'd0' },
    ...m.edges.filter((e) => e.from[0] !== 's' && !['sA', 'sB'].includes(e.to))];
  return m;
}

const timed = (f) => { const t = performance.now(); const r = f(); return { r, ms: performance.now() - t }; };

for (const n of [30, 100, 200, 1000]) {
  test(`a chain of ${n} decisions: validated with no warnings, generated in VHDL and Verilog in a bounded time`, () => {
    const m = chain(n);
    const { r: diags, ms: tv } = timed(() => validate(m));
    assert.deepEqual(diags, []);
    for (const lang of ['vhdl', 'verilog']) {
      const { r, ms } = timed(() => generate(m, lang).code);
      assert.ok(tv + ms < 10000, `${n} decisions, ${lang}: ${Math.round(tv + ms)} ms`);
      const c = lang === 'vhdl' ? '--' : '//';
      // the header counts the paths of A (2^n) instead of listing them; B's are listed
      assert.ok(r.includes(`${c}   (state A: ${2n ** BigInt(n)} paths through its decisions, too many to list)\n`), lang);
      assert.match(r, new RegExp(`^${c}   B +: always -> A$`, 'm'));
      // each conditional output written once: the size grows with the chain, not with its paths
      assert.equal(r.split('\n').filter((l) => /\by\b.*(<=|=) .*;$/.test(l) && !l.trim().startsWith(c)).length, n + 1, lang);
      assert.ok(r.length < 400 * n + 20000, `${lang}: ${r.length} characters`);
    }
  });
}

test('a chain of 30 decisions compiles and elaborates in VHDL and in Verilog, with no warnings', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const { code } = generate(chain(30), lang);
    const r = simulate([{ path: lang === 'vhdl' ? 'chain.vhd' : 'chain.v', text: code }], 'chain', { until: 100 });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual(r.warnings || [], [], lang);
  }
});

test('a chain of 1000 decisions in an every-cycle block: validated and generated in a bounded time', () => {
  const m = alwaysChain(1000);
  const { r: diags, ms: tv } = timed(() => validate(m));
  assert.deepEqual(diags, []);
  for (const lang of ['vhdl', 'verilog']) {
    const { r, ms } = timed(() => generate(m, lang).code);
    assert.ok(tv + ms < 10000, `${lang}: ${Math.round(tv + ms)} ms`);
    assert.ok(r.includes(`   (every cycle outs: ${2n ** 1000n} paths through its decisions, too many to list)\n`), lang);
  }
  assert.throws(() => extractAlwaysBlocks(m), { message: `Every-cycle block 'outs': ${2n ** 1000n} paths through the decisions, more than 4096 to list` });
});

// ---------------------------------------------------------------------------------------------------- simulated
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }
function vectorsFor(m, n, seed) {
  const r = rng(seed), out = [];
  for (let c = 0; c < n; c++) out.push({ ...Object.fromEntries(m.inputs.map((i) => [i.name, r() % (2 ** i.width)])), rst: c === 40 ? 1 : 0 });
  return out;
}
/** The outputs before each clock edge of the generated HDL, as '00000011_1_0'. */
function runHdl(m, lang, vectors) {
  const nm = (s) => (lang === 'vhdl' ? s.toLowerCase() : s);
  const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const L = ['module tb;', '  reg clk = 0; reg rst = 1;'];
  for (const i of m.inputs) L.push(`  reg ${vec(i.width)}i_${i.name} = 0;`);
  for (const o of m.outputs) L.push(`  wire ${vec(o.width)}o_${o.name};`);
  const conns = ['.clk(clk)', '.rst(rst)', ...m.inputs.map((i) => `.${nm(i.name)}(i_${i.name})`), ...m.outputs.map((o) => `.${nm(o.name)}(o_${o.name})`)];
  L.push(`  ${nm(m.name)} dut(${conns.join(', ')});`, '  always #5 clk = ~clk;', '  initial begin', '    #12 rst = 0;');
  for (const v of vectors) {
    const asg = [...m.inputs.map((i) => `i_${i.name} = ${i.width}'d${v[i.name]};`), `rst = ${v.rst};`].join(' ');
    L.push(`    ${asg} #2 $display("${m.outputs.map(() => '%b').join('_')}", ${m.outputs.map((o) => `o_${o.name}`).join(', ')}); @(posedge clk); #1;`);
  }
  L.push('    $finish;', '  end', 'endmodule');
  const { code } = generate(m, lang);
  const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e8 });
  assert.deepEqual(r.errors, [], `${lang}: simulation errors`);
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz_]+$/.test(s));
}
const rowText = (m, row) => m.outputs.map((o) => row.outputs[o.name].toString(2).padStart(o.width, '0')).join('_');

for (const [name, m] of [['3 decisions (written in full)', chain(3)], ['12 decisions (their branches up to where they meet again)', chain(12)],
  ['12 decisions that may leave the chain (no join point)', chain(12, { escape: true })], ['an every-cycle block of 12 decisions', alwaysChain(12)]]) {
  test(`a chain of ${name}: the generated VHDL and Verilog simulate as the chart, cycle by cycle`, () => {
    assert.deepEqual(validate(m), []);
    const vectors = vectorsFor(m, 160, 7);
    const mine = simulateAsm(m, vectors).map((row) => rowText(m, row));
    for (const lang of ['vhdl', 'verilog']) {
      const hdl = runHdl(m, lang, vectors);
      assert.equal(hdl.length, vectors.length);
      const i = hdl.findIndex((x, c) => x !== mine[c]);
      assert.equal(i, -1, `${lang}: cycle ${i}: the HDL gives ${hdl[i]}, the chart ${mine[i]}`);
    }
  });
}

// ---------------------------------------------------------------------------------------------------- the limits
test('a chain whose branches never meet again past GEN_MAX statements: the generator says so', () => {
  const m = chain(40, { escape: true });
  assert.deepEqual(validate(m), []);
  const { ms } = timed(() => assert.throws(() => generate(m, 'vhdl'), { message: "State 'A': its logic takes more than 200000 statements, too many to generate" }));
  assert.ok(ms < 10000, `${Math.round(ms)} ms`);
});

test('the paths listed one by one: extractTransitions and the conversion to a state diagram say how many there are', () => {
  assert.throws(() => extractTransitions(chain(30)), { message: `State 'A': ${2n ** 30n} paths through the decisions, more than 4096 to list` });
  assert.equal(extractTransitions(chain(12)).find((s) => s.name === 'A').transitions.length, 4096);
  assert.throws(() => asmToFsm(chain(30)), { message: `the state A has ${2n ** 30n} paths through its decisions, more than 4096 transitions for a state diagram` });
  // a ladder of 300 decisions (each 0 branch leaves for B): 301 paths, converted (no loop mistaken for its depth)
  const ladder = chain(0);
  ladder.nodes.push(...Array.from({ length: 300 }, (_, i) => ({ id: `d${i}`, type: 'decision', cond: `a[${i % 4}]` })));
  ladder.edges.push(...Array.from({ length: 300 }, (_, i) => [{ from: `d${i}`, to: i + 1 < 300 ? `d${i + 1}` : 'sA', port: 'true' }, { from: `d${i}`, to: 'sB', port: 'false' }]).flat());
  ladder.edges.push({ from: 'sA', to: 'd0' });
  ladder.edges.splice(0, 1);
  const f = asmToFsm(ladder);
  assert.deepEqual(f.states.map((s) => s.name), ['A', 'B']);
  // a loop is still a loop
  const loop = chain(30);
  loop.edges.find((e) => e.from === 't29').to = 'd0';
  assert.throws(() => asmToFsm(loop), { message: 'the chart has a loop without a state' });
});

test('a chain of 30 decisions that loops back: its loop reported, in a bounded time', () => {
  const m = chain(30);
  m.edges.find((e) => e.from === 't29').to = 'd0';
  const { r, ms } = timed(() => validate(m));
  assert.ok(ms < 10000, `${Math.round(ms)} ms`);
  assert.deepEqual(r.map((d) => `${d.severity}: ${d.message}`), [
    "error: Loop through decision/output boxes without a state (in the block of state 'A')",
    "warning: State 'B' is unreachable from the initial state",
  ]);
});

// ---------------------------------------------------------------------------------------------------- join points
/** The join points by their definition: the nearest box every path from the decision's branches goes through. */
function referenceJoin(m, id) {
  const isState = (x) => m.nodes.find((n) => n.id === x).type === 'state';
  const paths = [];   // every path from the decision to a state: the boxes after it
  const walk = (x, p) => { for (const e of m.edges.filter((y) => y.from === x)) if (isState(e.to)) paths.push(p); else walk(e.to, [...p, e.to]); };
  walk(id, []);
  const common = paths[0].filter((x) => paths.every((p) => p.includes(x)));
  return common.length ? common[0] : null;
}

test('the join points: the nearest box all the paths of a decision go through, as their definition gives them', () => {
  const r = rng(3);
  for (let k = 0; k < 200; k++) {
    // a random loop-free block: decisions and outputs, each exit to a later box or to a state
    const N = 4 + (r() % 12);
    const nodes = [{ id: 's0', type: 'state', name: 'S0', actions: [] }];
    const edges = [{ from: 's0', to: 'b0' }];
    for (let i = 0; i < N; i++) {
      const dec = r() % 3 !== 0;
      nodes.push(dec ? { id: `b${i}`, type: 'decision', cond: 'x' } : { id: `b${i}`, type: 'output', actions: [] });
      const to = () => { const j = i + 1 + (r() % 4); return j < N ? `b${j}` : 's0'; };
      if (dec) edges.push({ from: `b${i}`, to: to(), port: 'true' }, { from: `b${i}`, to: to(), port: 'false' });
      else edges.push({ from: `b${i}`, to: to() });
    }
    const m = { name: 'j', inputs: [{ name: 'x', width: 1 }], outputs: [], nodes, edges, initial: 's0' };
    const join = asmJoinPoints(m);
    for (const n of nodes.filter((x) => x.type === 'decision')) assert.equal(join(n.id), referenceJoin(m, n.id), `chart ${k}, ${n.id}`);
  }
});
