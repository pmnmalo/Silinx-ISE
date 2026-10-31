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

test('#2360 a family added by its back end goes through the whole flow with its own steps, and no warnings', async () => {
  const calls = [];
  const remove = registerBackend({
    id: 'fake', synth: async () => { calls.push('synth'); return SYNTH; },
    mount: ctx => ({
      runMap: () => calls.push('map'), runPar: async () => { calls.push('par'); ctx.setRouted('routed'); },
      runTiming: () => calls.push(`timing ${ctx.routedText()}`), runPins: () => calls.push('pins'), runPower: () => calls.push('power'),
      bitfile: (name, clk) => { calls.push(`bit ${clk}`); return { path: ctx.io.write(name, 'bits'), size: 4 }; },
    }),
  });
  try {
    const { io, log, files } = memoryIo();
    const r = await runFlow({ top: 'top', family: 'fake', part: 'fake1', device: 'fake1', steps: STEPS, startupClk: 'JtagClk' }, io);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(calls, ['synth', 'map', 'par', 'timing routed', 'pins', 'power', 'bit JtagClk']);
    assert.equal(files['top.bit'], 'bits');
    assert.deepEqual(log.filter(l => /^(WARNING|ERROR)/.test(l)), []);
    assert.equal(log.at(-1), '=== SILINX DONE ===');
  } finally { remove(); }
  assert.notEqual(backendOf('fake').id, 'fake');
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

test('#2360 the orchestrator names no family and no engine', () => {
  const code = fs.readFileSync(new URL('../packages/silinx-fpga/src/open-flow-core.js', import.meta.url), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).map(l => l.replace(/\s\/\/ .*$/, '')).join('\n');
  assert.deepEqual(code.match(/spartan\w*|nextpnr|mountS6|\bs6\b|spec\.engine|spec\.family\s*[!=]=/gi) || [], []);
});
