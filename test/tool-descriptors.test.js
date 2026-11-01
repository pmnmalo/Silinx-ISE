// web/js/tool-descriptors.js (#2311): a descriptor per back end, the process tree and the task list built from it. The
// trees below are the ones processes.js wrote by hand before: the interface stays as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ISE, SILINX, SILINX_ICE40, TOOLS, allTasks, buildProcesses, hasTask, toolOf, MESSAGE_LINE, EXTRA_STEPS, IMPL_IDS } from '../web/js/tool-descriptors.js';
import { XILINX_STEPS, orderSteps } from '../packages/silinx-fpga/src/open-steps.js';
import { ICE40_STEPS } from '../packages/silinx-fpga/src/open-flow-ice40.js';

const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ids = t => t.flatMap(n => [n.id, ...ids(n.children || [])]);
const allActions = tool => Object.fromEntries(ids(tool.tree).filter(Boolean).map(id => [id, () => `ran ${id}`]));
const PARTS = { summary: { id: 'summary' }, constraints: { id: 'constraints' }, emulate: { id: 'emulate' } };
const shape = n => (n.children ? { [n.id]: n.children.map(shape) } : n.id);
const built = (tool, more = {}) => buildProcesses(tool, { parts: PARTS, actions: allActions(tool), runFlow: s => s, ...more });
const find = (t, id) => { for (const n of t) { if (n.id === id) return n; const c = find(n.children || [], id); if (c) return c; } return null; };

const XILINX_SHAPE = extra => [
  'summary', 'constraints',
  { synth: ['rtl', 'tech', 'check', 'cmodel', 'postsynth'] },
  ...extra,
  { impl: [{ translate: ['posttrans'] }, { map: ['postmap'] }, { par: ['trce', 'xpwr', 'postpar', 'pin2ucf', 'fpgaview'] }] },
  'bitgen', 'emulate', { config: ['impact'] },
];

test('#2311 ISE: its process tree, Synthesize - XST and the open synthesis beside it, nothing with a tooltip', () => {
  const t = built(ISE);
  assert.deepEqual(t.map(shape), XILINX_SHAPE(['synth-open']));
  assert.equal(find(t, 'synth').label, 'Synthesize - XST');
  assert.equal(find(t, 'synth-open').label, 'Synthesize - Yosys (open)');
  assert.equal(find(t, 'impact').label, 'Manage Configuration Project (iMPACT)');
  for (const id of ['synth', 'impl', 'bitgen']) assert.equal(find(t, id).title, undefined, id);
});

test('#2311 the Silinx toolchain: ISE\'s tree without the open synthesis, Synthesize is Yosys, its runs say the toolchain', () => {
  const t = built(SILINX);
  assert.deepEqual(t.map(shape), XILINX_SHAPE([]));
  assert.equal(find(t, 'synth').label, 'Synthesize - Yosys');
  for (const id of ['synth', 'impl', 'bitgen']) assert.equal(find(t, id).title, 'Silinx toolchain (no ISE)', id);
  assert.equal(find(t, 'translate').title, undefined);
});

test('#2311 the iCE40: what it does not have is absent, not disabled', () => {
  const t = built(SILINX_ICE40);
  assert.deepEqual(t.map(shape), ['summary', 'constraints', { synth: ['rtl', 'check', 'cmodel'] },
    { impl: [{ translate: [] }, { par: [] }] }, 'bitgen', 'emulate', { config: ['impact'] }]);
  for (const id of ids(t)) assert.equal(find(t, id).disabled, undefined, id);
  assert.equal(find(t, 'synth').label, 'Synthesize - Yosys');
  assert.equal(find(t, 'par').label, 'Place & Route');
});

test('#2311 a node\'s labels, icons and what it says to the top, as they were', () => {
  const t = built(ISE);
  const f = id => { const { label, ico, onTop } = find(t, id); return [label, ico, onTop]; };
  assert.deepEqual(f('rtl'), ['View RTL Schematic', 'schematic', undefined]);
  assert.deepEqual(f('tech'), ['View Technology Schematic', 'schematic', 'synthesizes']);
  assert.deepEqual(f('check'), ['Check Syntax', 'process', undefined]);
  assert.deepEqual(f('synth'), ['Synthesize - XST', 'process', 'synthesizes']);
  assert.deepEqual(f('impl'), ['Implement Design', 'process', 'implements']);
  assert.deepEqual(f('fpgaview'), [EXTRA_STEPS.fpgaview, 'chip', 'implements']);
  assert.deepEqual(f('config'), ['Configure Target Device', 'impact', undefined]);
  assert.deepEqual(f('bitgen'), ['Generate Programming File', 'process', 'implements']);
  for (const id of Object.keys(EXTRA_STEPS)) assert.equal(find(t, id).label, EXTRA_STEPS[id], id);
});

test('#2311 what a node runs: a run is the chain up to its step, the same on every tool; the others their action', () => {
  for (const tool of TOOLS) {
    const t = built(tool);
    const chain = { synth: ['synth'], translate: ['synth', 'translate'], impl: ['synth', 'translate', 'map', 'par'], par: ['synth', 'translate', 'map', 'par'], bitgen: ['synth', 'translate', 'map', 'par', 'bitgen'], map: ['synth', 'translate', 'map'] };
    for (const [id, steps] of Object.entries(chain)) if (find(t, id)) assert.deepEqual(find(t, id).run(), steps, `${tool.id} ${id}`);
    assert.equal(find(t, 'check').run(), 'ran check');
    // (the node's own fields are not in the interface's process)
    for (const id of ids(t)) for (const f of ['flow', 'optional', 'part']) assert.ok(!(f in find(t, id)), `${tool.id} ${id} ${f}`);
  }
});

test('#2311 an optional process with no action is left out (a C source, the Tasks interface\'s models); another one throws', () => {
  const { cmodel, postsynth, posttrans, postmap, postpar, ...actions } = allActions(ISE);
  const t = built(ISE, { actions });
  for (const id of ['cmodel', 'postsynth', 'posttrans', 'postmap', 'postpar']) assert.equal(find(t, id), null, id);
  assert.deepEqual(find(t, 'translate').children, []);
  const { rtl, ...noRtl } = allActions(ISE);
  assert.throws(() => built(ISE, { actions: noRtl }), /ise: no action for the process rtl/);
});

test('#2311 the tool of a project: ISE unless the Silinx toolchain, its back end by the family', () => {
  assert.equal(toolOf({ part: 'xc3s250e' }, false), ISE);
  assert.equal(toolOf({ part: 'xc3s250e' }, true), SILINX);
  assert.equal(toolOf({ part: 'xc6slx16' }, true), SILINX);
  assert.equal(toolOf({ part: 'ice40up5k' }, true), SILINX_ICE40);
  assert.equal(toolOf(undefined, true), SILINX);
  assert.equal(toolOf(undefined, false), ISE);
  assert.equal(toolOf({ part: 'nonsense' }, true), SILINX);
});

test('#2311 each descriptor\'s steps: its back end\'s list, in its order, each with what it produces', () => {
  assert.deepEqual(SILINX.steps.map(({ produces, ...s }) => s), XILINX_STEPS);
  assert.deepEqual(SILINX_ICE40.steps.map(({ produces, ...s }) => s), ICE40_STEPS);
  assert.deepEqual(ISE.steps.map(s => s.id), XILINX_STEPS.map(s => s.id));
  assert.equal(ISE.steps[0].label, 'Synthesize - XST');
  for (const tool of TOOLS) {
    for (const s of tool.steps) assert.ok(Array.isArray(s.produces), `${tool.id} ${s.id}`);
    assert.ok(orderSteps(tool.steps, ['bitgen']).includes('par'), tool.id);
    assert.ok(tool.steps.find(s => s.id === 'bitgen').produces.includes(tool.program.file), `${tool.id}: what it programs`);
  }
  // nothing an ISE run does not write
  const script = read('server/ise.js').replaceAll("' + '", '');
  for (const s of ISE.steps) for (const f of s.produces) {
    const name = f.replace(/^.*\{top\}/, '');
    assert.ok(script.includes(name), `${s.id}: ${f}`);
  }
  assert.deepEqual(SILINX_ICE40.steps.find(s => s.id === 'bitgen').produces, ['{top}.bin']);
  assert.ok(read('packages/silinx-fpga/src/open-flow-ice40.js').includes('open/routed.asc'));
});

test('#2311 each descriptor\'s reports: of a step it has, a file that step produces', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.reports.length, tool.id);
    for (const r of tool.reports) {
      const s = tool.steps.find(x => x.id === r.step);
      assert.ok(s, `${tool.id} ${r.id}: step ${r.step}`);
      assert.ok(s.produces.includes(r.file), `${tool.id} ${r.id}: ${r.file}`);
    }
  }
  assert.deepEqual(ISE.reports.map(r => r.file), ['{top}.syr', '{top}_map.mrp', '{top}.par', '{top}.twr']);
  assert.ok(!SILINX_ICE40.reports.some(r => r.id === 'timing'));   // (nextpnr's report gives the timing)
});

test('#2311 each descriptor\'s constraints: UCF, or PCF on the iCE40, as a new project of its device', async () => {
  assert.deepEqual([ISE, SILINX, SILINX_ICE40].map(t => t.constraints.format), ['ucf', 'ucf', 'pcf']);
  assert.deepEqual([ISE, SILINX, SILINX_ICE40].map(t => t.constraints.ext), ['.ucf', '.ucf', '.pcf']);
  const src = read('web/js/constraints-format.js');
  assert.match(src, /openOnlyDevice\(device\) \? '\.pcf' : '\.ucf'/);
});

test('#2311 each descriptor\'s messages: the log\'s lines read, the markers the step tracker reads', () => {
  const m = l => { const r = MESSAGE_LINE.exec(l); return r && [r[1], r[2], r[3]]; };
  assert.deepEqual(m('ERROR:Xst:528 - "a.vhd" line 1'), ['ERROR', 'Xst:528', '"a.vhd" line 1']);
  assert.deepEqual(m('WARNING:Par - no timing'), ['WARNING', 'Par', 'no timing']);
  assert.deepEqual(m('ERROR: plain'), ['ERROR', undefined, 'plain']);
  assert.deepEqual(m('CRITICAL WARNING: x'), ['CRITICAL WARNING', undefined, 'x']);
  assert.equal(m('Info: nothing'), null);
  assert.match(read('web/js/console.js'), /MESSAGE_LINE\.exec\(line\)/);
  const tracker = read('web/js/implement.js');
  for (const tool of TOOLS) {
    assert.equal(tool.messages.line, MESSAGE_LINE, tool.id);
    for (const k of ['stepFailed', 'done']) assert.ok(tracker.includes(tool.messages[k]), `${tool.id} ${k}`);
    assert.ok(tracker.includes(tool.messages.stepStart.replace('STEP', '')) || read('server/ise.js').includes(tool.messages.stepStart), `${tool.id} stepStart`);
  }
});

test('#2311 each descriptor\'s programming: its process in its tree, the file its board is given', () => {
  for (const tool of TOOLS) assert.ok(find(tool.tree, tool.program.process), tool.id);
  assert.deepEqual([ISE, SILINX, SILINX_ICE40].map(t => t.program.file), ['{top}.bit', '{top}.bit', '{top}.bin']);
  assert.equal(SILINX_ICE40.program.prom, undefined);
  assert.equal(ISE.program.prom, '{top}_prom.bit');
  // (#2298: the iCE40's page, its tab's title, and the others' iMPACT)
  assert.deepEqual([ISE, SILINX, SILINX_ICE40].map(t => [t.program.page, t.program.title, t.program.target]),
    [['impact', 'iMPACT', 'jtag'], ['impact', 'iMPACT', 'jtag'], ['program-ice40', 'Program Flash', 'spi-flash']]);
  assert.ok(fs.existsSync(new URL('../web/js/program-ice40.js', import.meta.url)));
  assert.match(read('web/js/app.js'), /'Program Flash' : 'iMPACT'/);
});

test('#2311 the task list: every tool has the four tasks of a lab session, each with its button and its dot', () => {
  assert.deepEqual(allTasks().map(t => t.id), ['edit', 'sim', 'emu', 'impl']);
  for (const tool of TOOLS) {
    assert.deepEqual(tool.tasks.map(t => [t.id, t.label, t.step]), [['edit', 'Design', 'check'], ['sim', 'Simulate', 'simulate'], ['emu', 'Emulate', 'emulate'], ['impl', 'Implement', 'implement']], tool.id);
    for (const id of ['edit', 'sim', 'emu', 'impl']) assert.ok(hasTask(tool, id), `${tool.id} ${id}`);
    assert.equal(hasTask(tool, 'prog'), false);
  }
});

test('#2311 a tool without a task does not have it; the list of all keeps every tool\'s, in their order', async () => {
  const noEmu = { ...SILINX, id: 'no-emu', tasks: SILINX.tasks.filter(t => t.id !== 'emu') };
  assert.equal(hasTask(noEmu, 'emu'), false);
  assert.deepEqual(allTasks([noEmu]).map(t => t.id), ['edit', 'sim', 'impl']);
  assert.deepEqual(allTasks([noEmu, ISE]).map(t => t.id), ['edit', 'sim', 'impl', 'emu']);
  globalThis.addEventListener ??= () => {};
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
  const T = await import('../web/js/tasks.js');
  assert.deepEqual(T.TASKS, allTasks().map(t => t.id));
  // the dot: the tool's list
  assert.equal(T.taskDot('impl', { map: 'err' }, ISE), 'err');
  const noMap = { ...ISE, tasks: ISE.tasks.map(t => (t.id === 'impl' ? { ...t, dots: ['par'] } : t)) };
  assert.equal(T.taskDot('impl', { map: 'err' }, noMap), null);
  assert.equal(T.taskDot('emu', { map: 'err' }, noEmu), null);
});

test('#2311 the marks kept: every process of a run in IMPL_IDS, for every tool', () => {
  for (const tool of TOOLS) for (const id of ids(tool.tree).filter(id => id && EXTRA_STEPS[id])) assert.ok(IMPL_IDS.includes(id), `${tool.id} ${id}`);
});

test('#2311 #1678 the descriptors import the toolchain\'s light entry only', () => {
  const imports = [...read('web/js/tool-descriptors.js').matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(imports, ['../../packages/silinx-fpga/src/parts.js']);
});

test('#2311 the mechanism of the disabled process is gone: absent, not disabled', () => {
  const src = read('web/js/processes.js');
  assert.doesNotMatch(src, /ISE_ONLY|forOpenMode|OPEN_ONLY_ABSENT/);
  assert.match(src, /buildProcesses\(projectTool\(\)/);
});
