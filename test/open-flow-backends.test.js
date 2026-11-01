// The flow's back ends (#2360): runFlow names no family and no engine; a family is added by registering its back end,
// which runs through the orchestrator with its own steps; the families' back ends are the ones they were.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runFlow, backendOf, registerBackend } from '../packages/silinx-fpga/src/index.js';
import { synthesizeVerilog } from '../packages/silinx-fpga/src/synth-open.js';
import { OPEN_STEPS, XILINX_STEPS, orderSteps } from '../packages/silinx-fpga/src/open-steps.js';

const SYNTH = { top: 'top', files: { 'top.json': '{"modules":{"top":{"ports":{},"cells":{},"netnames":{}}}}', 'top_stat.txt': 'cells 0' }, util: { cells: 0 }, warnings: [] };
function memoryIo(over = {}) {
  const log = [], files = {};
  return { log, files, io: { log: l => log.push(l), sources: () => [{ path: 'top.v', lang: 'verilog', text: 'module top; endmodule' }], ucf: null, save: () => {},
    write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null, ...over } };
}
const STEPS = ['synth', 'translate', 'map', 'par', 'trce', 'xpwr', 'pin2ucf', 'bitgen'];

// a fake family whose routed design is its own format and file (#2384), read again from an earlier run
function fakeBackend(calls) {
  return {
    id: 'fake', synth: async () => { calls.push('synth'); return SYNTH; },
    mount: ctx => {
      let routed = null;
      const need = () => { routed ??= ctx.io.read('open/top.asc'); if (routed == null) throw new ctx.StepError('nothing routed', [], ''); return routed; };
      const bit = (name, clk) => { calls.push(`bit ${clk} ${need()}`); ctx.io.write(name, 'bits'); };
      return { steps: {
        translate: ctx.readNetlist, map: () => calls.push('map'), par: async () => { calls.push('par'); routed = '.asc 1'; ctx.report.files.routed = ctx.io.write('open/top.asc', routed); },
        trce: () => calls.push(`timing ${need()}`), pin2ucf: () => calls.push('pins'), xpwr: () => calls.push(`power ${need()}`),
        bitgen: () => bit('top.bit', ctx.spec.startupClk), prombit: () => bit('top_prom.bit', 'Cclk'), fpgaview: () => calls.push(`view ${need()}`),
      } };
    },
  };
}

test('#2360 a family added by its back end goes through the whole flow with its own steps, and no warnings', async () => {
  const calls = [];
  const remove = registerBackend(fakeBackend(calls));
  try {
    const { io, log, files } = memoryIo();
    const r = await runFlow({ top: 'top', family: 'fake', part: 'fake1', device: 'fake1', steps: [...STEPS, 'fpgaview'], startupClk: 'JtagClk' }, io);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(calls, ['synth', 'map', 'par', 'timing .asc 1', 'pins', 'power .asc 1', 'bit JtagClk .asc 1', 'view .asc 1']);
    assert.equal(files['top.bit'], 'bits');
    assert.equal(r.report.files.routed, 'build/open/top.asc');
    assert.ok(!Object.keys(files).some(n => /xdl/.test(n)), Object.keys(files).join());
    assert.deepEqual(log.filter(l => /^(WARNING|ERROR)/.test(l)), []);
    assert.equal(log.at(-1), '=== SILINX DONE ===');
  } finally { remove(); }
  assert.notEqual(backendOf('fake').id, 'fake');
});

test('#2384 the routed design is the back end\'s: an earlier run\'s read in its format, or the back end\'s error when there is none', async () => {
  const calls = [];
  const remove = registerBackend(fakeBackend(calls));
  try {
    const { io, files } = memoryIo();
    files['open/top.asc'] = '.asc 0';
    const r = await runFlow({ top: 'top', family: 'fake', steps: ['trce', 'bitgen', 'prombit'], startupClk: 'JtagClk' }, io);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(calls, ['timing .asc 0', 'bit JtagClk .asc 0', 'bit Cclk .asc 0']);
    const none = memoryIo();
    const r2 = await runFlow({ top: 'top', family: 'fake', steps: ['trce'] }, none.io);
    assert.equal(r2.ok, false);
    assert.deepEqual(none.log.slice(-2), ['ERROR:Silinx - nothing routed', '=== SILINX FAILED trce (exit 1) ===']);
  } finally { remove(); }
});

// a format of a fake family's own: `pin name site` and `clock name ns`, the rest its own text
const PINS = {
  id: 'pins',
  read(text) {
    const m = { assignments: {}, netStatements: [], clocks: [], other: [] };
    for (const l of text.split('\n').filter(Boolean)) {
      const [k, a, b] = l.split(' ');
      if (k === 'pin') { m.assignments[a] = { loc: b }; m.netStatements.push({ net: a, attrs: { loc: b } }); }
      else if (k === 'clock') m.clocks.push({ net: a, period: +b, duty: 50 });
      else if (k === 'bad') throw new Error(`bad line: ${l}`);
      else m.other.push(l);
    }
    return m;
  },
  write: () => '',
};

test('#2385 the constraints reach a back end as the model of its own format, and the log says it', async () => {
  let seen = null;
  const remove = registerBackend({ id: 'fake', constraints: PINS, synth: async () => SYNTH, mount: ctx => ({ steps: { translate: ctx.readNetlist, map: () => { seen = ctx.constraints(); } } }) });
  try {
    const { io, log } = memoryIo();
    io.ucf = 'pin led B2\nclock clk 20\nkeep this';
    const r = await runFlow({ top: 'top', family: 'fake', steps: ['synth', 'translate', 'map'] }, io);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(seen.assignments, { led: { loc: 'B2' } });
    assert.deepEqual(seen.clocks, [{ net: 'clk', period: 20, duty: 50 }]);
    assert.deepEqual(seen.other, ['keep this']);
    assert.equal(seen.format, 'pins');
    assert.ok(log.includes('Netlist of <top> read; constraints: the PINS, 1 pin location(s), 1 PERIOD constraint(s).'), log.join('\n'));
    assert.deepEqual(log.filter(l => /^(WARNING|ERROR)/.test(l)), []);
  } finally { remove(); }
});

test('#2385 constraints its format cannot read fail at translate, with the format\'s message; none: the model is null', async () => {
  let seen;
  const remove = registerBackend({ id: 'fake', constraints: PINS, synth: async () => SYNTH, mount: ctx => ({ steps: { translate: ctx.readNetlist, map: () => { seen = ctx.constraints(); } } }) });
  try {
    const { io, log } = memoryIo();
    io.ucf = 'bad line';
    const r = await runFlow({ top: 'top', family: 'fake', steps: ['synth', 'translate', 'map'] }, io);
    assert.equal(r.ok, false);
    assert.ok(log.includes('ERROR:Silinx - the constraints cannot be read: bad line: bad line'), log.join('\n'));
    assert.equal(log.at(-1), '=== SILINX FAILED translate (exit 1) ===');
    const none = memoryIo();
    assert.equal((await runFlow({ top: 'top', family: 'fake', steps: ['synth', 'translate', 'map'] }, none.io)).ok, true);
    assert.equal(seen, null);
    assert.ok(none.log.includes('Netlist of <top> read; constraints: none.'), none.log.join('\n'));
  } finally { remove(); }
});

test('#2385 the orchestrator and the reports do not parse UCF', () => {
  for (const f of ['open-flow-core.js', 'open-flow-reports.js', 'open-flow-nextpnr.js', 'open-flow-nextpnr-s6.js', 'open-flow-s3e.js', 'open-flow-s6.js']) {
    assert.doesNotMatch(fs.readFileSync(new URL(`../packages/silinx-fpga/src/${f}`, import.meta.url), 'utf8'), /parseUcf|ucfText/, f);
  }
});

test('#2360 a back end\'s step that fails: the flow reports it as any step, with its hint', async () => {
  const remove = registerBackend({ id: 'fake', synth: async () => SYNTH, mount: ctx => ({ steps: { translate: ctx.readNetlist, map: () => { throw new ctx.StepError('no sites', ['a'], 'Another device.'); } } }) });
  try {
    const { io, log } = memoryIo();
    const r = await runFlow({ top: 'top', family: 'fake', steps: ['synth', 'translate', 'map'] }, io);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no sites');
    assert.deepEqual(log.slice(-4), ['ERROR:Silinx - no sites', '  a', 'Another device.', '=== SILINX FAILED map (exit 1) ===']);
  } finally { remove(); }
});

test('#2360 the registry: the two families, the others implemented as the Spartan-3E with their MAP report\'s names, bad back ends refused', () => {
  const lut = { id: 'luts', report: 'Number of Slice LUTs' };
  assert.equal(backendOf('spartan3e').synthName('luts', lut), 'Number of 4 input LUTs');
  assert.equal(backendOf('spartan6').id, 'spartan6');
  assert.equal(backendOf('spartan6').synthName('luts', lut), 'Number of Slice LUTs');
  assert.equal(backendOf('spartan6').synthName('ramb16', undefined), 'Number of RAMB16s');
  assert.equal(backendOf('spartan3a').mount, backendOf('spartan3e').mount);
  assert.equal(backendOf('spartan3a').synthName('luts', lut), 'Number of Slice LUTs');
  assert.equal(backendOf(undefined).synthName('luts', lut), 'Number of Slice LUTs');
  // (#2386: the Xilinx families' synthesis is synth-open.js's, synth_xilinx and its mappings)
  for (const f of ['spartan3e', 'spartan6', 'spartan3a']) assert.equal(backendOf(f).synth, synthesizeVerilog, f);
  assert.throws(() => registerBackend({ id: 'x' }), /mount/);
  assert.throws(() => registerBackend({ id: 'spartan6', mount() {} }), /has its back end/);
});

// a family with steps of its own (#2387): no Translate, no Map, no PROM file
const OWN_STEPS = [{ id: 'synth', label: 'Synthesize', needs: [] }, { id: 'pnr', label: 'Place and route', needs: ['synth'] },
  { id: 'timing', label: 'Timing', needs: ['pnr'] }, { id: 'bitstream', label: 'Bitstream', needs: ['pnr'] }];

test('#2387 a family runs its own list of steps, in its order, with no warnings; a step it lists but has not, an error', async () => {
  const calls = [];
  const remove = registerBackend({ id: 'fake', steps: OWN_STEPS, synth: async () => { calls.push('synth'); return SYNTH; },
    mount: ctx => ({ steps: {
      pnr: () => { ctx.readNetlist(); calls.push(`pnr ${ctx.netlist().ports.length}`); },
      timing: () => calls.push('timing'), bitstream: () => { calls.push('bitstream'); ctx.report.bit = { path: ctx.io.write('top.bin', 'b'), size: 1 }; },
    } }) });
  try {
    const { io, log, files } = memoryIo();
    const r = await runFlow({ top: 'top', family: 'fake', steps: orderSteps(OWN_STEPS, ['bitstream', 'timing']) }, io);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(calls, ['synth', 'pnr 0', 'timing', 'bitstream']);
    assert.deepEqual(log.filter(l => /^=== SILINX/.test(l)), ['synth', 'pnr', 'timing', 'bitstream'].map(s => `=== SILINX STEP ${s} ===`).concat('=== SILINX DONE ==='));
    assert.equal(files['top.bin'], 'b');
    assert.deepEqual(log.filter(l => /^(WARNING|ERROR)/.test(l)), []);
  } finally { remove(); }
  const remove2 = registerBackend({ id: 'fake', steps: OWN_STEPS, synth: async () => SYNTH, mount: () => ({ steps: {} }) });
  try {
    const { io, log } = memoryIo();
    const r = await runFlow({ top: 'top', family: 'fake', steps: ['synth', 'pnr'] }, io);
    assert.equal(r.ok, false);
    assert.deepEqual(log.slice(-2), ['ERROR:Silinx - the back end of fake has no step pnr', '=== SILINX FAILED pnr (exit 1) ===']);
  } finally { remove2(); }
});

test('#2387 the Xilinx families\' list: ISE\'s steps and names, the IDE\'s processes\' labels', () => {
  for (const f of ['spartan3e', 'spartan6', 'spartan3a']) assert.equal(backendOf(f).steps, XILINX_STEPS, f);
  assert.deepEqual(XILINX_STEPS.map(s => s.id), OPEN_STEPS);
  const processes = fs.readFileSync(new URL('../web/js/tool-descriptors.js', import.meta.url), 'utf8');   // (the tree's, #2311)
  for (const s of XILINX_STEPS.filter(s => !['synth', 'prombit'].includes(s.id))) assert.ok(processes.includes(`'${s.label}'`), s.label);
  // a registered back end with no list of its own: the Xilinx families'
  const remove = registerBackend({ id: 'fake', mount: () => ({}) });
  try { assert.equal(backendOf('fake').steps, XILINX_STEPS); } finally { remove(); }
});

test('#2360 #2384 #2386 #2387 the orchestrator names no family, no engine, no routed design\'s format, no family\'s synthesis and no family\'s step', () => {
  const code = fs.readFileSync(new URL('../packages/silinx-fpga/src/open-flow-core.js', import.meta.url), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).map(l => l.replace(/\s\/\/ .*$/, '')).join('\n');
  assert.deepEqual(code.match(/spartan\w*|nextpnr|mountS6|\bs6\b|spec\.engine|spec\.family\s*[!=]=|xdl|routed\.\w+|synthesizeVerilog|synth_xilinx|xstNames|Number of 4 input|'(translate|map|par|trce|pin2ucf|xpwr|bitgen|prombit|fpgaview)'|\.bit\b|Cclk/gi) || [], []);
});
