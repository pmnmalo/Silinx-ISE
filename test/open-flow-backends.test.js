// The flow's back ends (#2360): runFlow names no family and no engine; a family is added by registering its back end,
// which runs through the orchestrator with its own steps; the families' back ends are the ones they were.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runFlow, backendOf, registerBackend } from '../packages/silinx-fpga/src/index.js';

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
      return {
        runMap: () => calls.push('map'), runPar: async () => { calls.push('par'); routed = '.asc 1'; ctx.report.files.routed = ctx.io.write('open/top.asc', routed); },
        runTiming: () => calls.push(`timing ${need()}`), runPins: () => calls.push('pins'), runPower: () => calls.push(`power ${need()}`),
        bitfile: (name, clk) => { calls.push(`bit ${clk} ${need()}`); return { path: ctx.io.write(name, 'bits'), size: 4 }; },
        runFpgaView: () => calls.push(`view ${need()}`),
      };
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

test('#2360 a back end\'s step that fails: the flow reports it as any step, with its hint', async () => {
  const remove = registerBackend({ id: 'fake', synth: async () => SYNTH, mount: ctx => ({ runMap: () => { throw new ctx.StepError('no sites', ['a'], 'Another device.'); } }) });
  try {
    const { io, log } = memoryIo();
    const r = await runFlow({ top: 'top', family: 'fake', steps: ['synth', 'translate', 'map'] }, io);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no sites');
    assert.deepEqual(log.slice(-4), ['ERROR:Silinx - no sites', '  a', 'Another device.', '=== SILINX FAILED map (exit 1) ===']);
  } finally { remove(); }
});

test('#2360 the registry: the two families, the others implemented as the Spartan-3E with their MAP report\'s names, bad back ends refused', () => {
  assert.equal(backendOf('spartan3e').xstNames, true);
  assert.equal(backendOf('spartan6').id, 'spartan6');
  assert.equal(backendOf('spartan3a').mount, backendOf('spartan3e').mount);
  assert.ok(!backendOf('spartan3a').xstNames);
  assert.ok(!backendOf(undefined).xstNames);
  assert.throws(() => registerBackend({ id: 'x' }), /mount/);
  assert.throws(() => registerBackend({ id: 'spartan6', mount() {} }), /has its back end/);
});

test('#2360 #2384 the orchestrator names no family, no engine and no routed design\'s format', () => {
  const code = fs.readFileSync(new URL('../packages/silinx-fpga/src/open-flow-core.js', import.meta.url), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).map(l => l.replace(/\s\/\/ .*$/, '')).join('\n');
  assert.deepEqual(code.match(/spartan\w*|nextpnr|mountS6|\bs6\b|spec\.engine|spec\.family\s*[!=]=|xdl|routed\.\w+/gi) || [], []);
});
