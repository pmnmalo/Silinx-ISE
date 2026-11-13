// web/js/tool-descriptors.js (#2311): a descriptor per back end, the process tree and the task list built from it. The
// trees below are the ones processes.js wrote by hand before: the interface stays as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ISE, NO_FLOW, DESIGN_ONLY, SILINX, SILINX_ICE40, SILINX_XC7, SILINX_ECP5, SILINX_GOWIN, VIVADO, TOOLS, allTasks, buildProcesses, hasTask, simModelsOf, toolOf, MESSAGE_LINE, EXTRA_STEPS, IMPL_IDS } from '../web/js/tool-descriptors.js';
import { XILINX_STEPS, orderSteps } from '../packages/silinx-fpga/src/open-steps.js';
import { ICE40_STEPS } from '../packages/silinx-fpga/src/open-flow-ice40.js';
import { XC7_STEPS } from '../packages/silinx-fpga/src/open-flow-xc7.js';
import { ECP5_STEPS } from '../packages/silinx-fpga/src/open-flow-ecp5.js';
import { GOWIN_STEPS } from '../packages/silinx-fpga/src/open-flow-gowin.js';
import { familyProfile } from '../core/family-profile.js';

const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ids = t => t.flatMap(n => [n.id, ...ids(n.children || [])]);
const allActions = tool => Object.fromEntries(ids(tool.tree).filter(Boolean).map(id => [id, () => `ran ${id}`]));
const PARTS = { summary: { id: 'summary' }, constraints: { id: 'constraints' }, emulate: { id: 'emulate' } };
const shape = n => (n.children ? { [n.id]: n.children.map(shape) } : n.id);
const built = (tool, more = {}) => buildProcesses(tool, { parts: PARTS, actions: allActions(tool), runFlow: s => s, ...more });
const find = (t, id) => { for (const n of t) { if (n.id === id) return n; const c = find(n.children || [], id); if (c) return c; } return null; };

const XILINX_SHAPE = (extra, config = ['impact']) => [
  'summary', 'constraints',
  { synth: ['rtl', 'tech', 'check', 'cmodel', 'postsynth'] },
  ...extra,
  { impl: [{ translate: ['posttrans'] }, { map: ['postmap'] }, { par: ['trce', 'xpwr', 'postpar', 'pin2ucf', 'fpgaview'] }] },
  'bitgen', 'emulate', { config },
];
// (the Silinx toolchain's Configure Target Device: the logic analyzer too, #3176; not ISE's, Vivado's or the iCE40's)
const SILINX_CONFIG = ['impact', { capture: ['capture-settings', 'capture-view'] }];

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
  assert.deepEqual(t.map(shape), XILINX_SHAPE([], SILINX_CONFIG));
  assert.deepEqual(['capture', 'capture-settings', 'capture-view'].map(id => find(t, id).label), ['Analyze Design Using the Logic Analyzer', 'Logic Analyzer Settings', 'View the Last Capture']);
  assert.equal(find(t, 'synth').label, 'Synthesize - Yosys');
  for (const id of ['synth', 'impl', 'bitgen']) assert.equal(find(t, id).title, 'Silinx toolchain (no ISE)', id);
  assert.equal(find(t, 'translate').title, undefined);
});

test('#2302 the ECP5: the iCE40\'s tree (Emulate there, #3704); its steps, reports, LPF; its .bit loaded into the SRAM (#2298)', () => {
  const t = built(SILINX_ECP5);
  assert.deepEqual(t.map(shape), ['summary', 'constraints', { synth: ['rtl', 'check', 'cmodel'] }, { impl: [{ translate: [] }, { par: ['trce'] }] }, 'bitgen', 'emulate', { config: ['impact'] }]);
  assert.equal(toolOf({ part: 'lfe5u-85f' }, true), SILINX_ECP5);
  assert.equal(toolOf({ part: 'lfe5um5g-45f' }, false), ISE, 'a choice of the interface: the device makes the open mode (processes.js openMode)');
  assert.deepEqual(SILINX_ECP5.steps.map(({ produces, ...s }) => s), ECP5_STEPS);
  assert.deepEqual(SILINX_ECP5.steps.find(s => s.id === 'bitgen').produces, ['{top}.bit']);
  assert.deepEqual(SILINX_ECP5.steps.find(s => s.id === 'par').produces, ['open/routed.config', 'open/nextpnr-report.json']);
  assert.deepEqual(SILINX_ECP5.steps.find(s => s.id === 'trce').produces, ['open/timing.txt', 'open/paths.json']);   // (#2300: nextpnr's timing)
  assert.deepEqual(SILINX_ECP5.reports.map(r => r.id), ['synthesis', 'routed', 'timing']);
  assert.ok(read('packages/silinx-fpga/src/open-flow-ecp5.js').includes("io.write('open/routed.config'"));
  for (const r of SILINX_ECP5.reports) assert.ok(SILINX_ECP5.steps.find(s => s.id === r.step).produces.includes(r.file), r.id);
  assert.deepEqual(SILINX_ECP5.constraints, { format: 'lpf', ext: '.lpf', label: 'LPF' });
  assert.deepEqual(SILINX_ECP5.program, { process: 'config', page: 'program-open', title: 'Program FPGA', target: 'sram', file: '{top}.bit' });
  assert.deepEqual(SILINX_ECP5.tasks.map(t => t.id), ['edit', 'sim', 'emu', 'impl']);
  assert.ok(!TOOLS.includes(SILINX_ECP5) && SILINX_ECP5.tasks.every(t => allTasks().includes(t)), 'its tasks the others\'');
  assert.equal(SILINX_ECP5.messages.line, MESSAGE_LINE);
});

test('#2303 the Gowin: the ECP5\'s tree; its steps (gowin_pack\'s .fs), reports, CST; its .fs loaded into the SRAM (#2298)', () => {
  const t = built(SILINX_GOWIN);
  assert.deepEqual(t.map(shape), ['summary', 'constraints', { synth: ['rtl', 'check', 'cmodel'] }, { impl: [{ translate: [] }, { par: ['trce'] }] }, 'bitgen', 'emulate', { config: ['impact'] }]);
  assert.equal(toolOf({ part: 'gw1nr-9c' }, true), SILINX_GOWIN);
  assert.deepEqual(SILINX_GOWIN.steps.find(s => s.id === 'bitgen').produces, ['{top}.fs']);
  assert.deepEqual(SILINX_GOWIN.steps.map(({ produces, ...s }) => s), GOWIN_STEPS);
  assert.deepEqual(SILINX_GOWIN.steps.find(s => s.id === 'par').produces, ['open/routed.json', 'open/nextpnr-report.json']);
  assert.deepEqual(SILINX_GOWIN.steps.find(s => s.id === 'trce').produces, ['open/timing.txt', 'open/paths.json']);
  assert.deepEqual(SILINX_GOWIN.reports.map(r => r.id), ['synthesis', 'routed', 'timing']);
  assert.ok(read('packages/silinx-fpga/src/open-flow-gowin.js').includes("io.write('open/routed.json'"));
  for (const r of SILINX_GOWIN.reports) assert.ok(SILINX_GOWIN.steps.find(s => s.id === r.step).produces.includes(r.file), r.id);
  assert.deepEqual(SILINX_GOWIN.constraints, { format: 'cst', ext: '.cst', label: 'CST' });
  assert.deepEqual(SILINX_GOWIN.program, { process: 'config', page: 'program-open', title: 'Program FPGA', target: 'sram', file: '{top}.fs' });
  assert.deepEqual(SILINX_GOWIN.tasks.map(t => t.id), ['edit', 'sim', 'emu', 'impl']);
});

test('#2311 the iCE40: what it does not have is absent, not disabled', () => {
  const t = built(SILINX_ICE40);
  assert.deepEqual(t.map(shape), ['summary', 'constraints', { synth: ['rtl', 'check', 'cmodel'] },
    { impl: [{ translate: [] }, { par: ['trce'] }] }, 'bitgen', 'emulate', { config: ['impact'] }]);
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
  assert.deepEqual(SILINX_XC7.steps.map(({ produces, ...s }) => s), XC7_STEPS);
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
  // (#2300: nextpnr's timing, its report's clocks and critical paths, as the Static Timing Report)
  assert.deepEqual(SILINX_ICE40.reports.find(r => r.id === 'timing'), { id: 'timing', label: 'Static Timing Report', step: 'trce', file: 'open/timing.txt' });
});

test('#2311 each descriptor\'s constraints: UCF, or PCF on the iCE40, as a new project of its device', async () => {
  assert.deepEqual([ISE, SILINX, SILINX_ICE40].map(t => t.constraints.format), ['ucf', 'ucf', 'pcf']);
  assert.deepEqual([ISE, SILINX, SILINX_ICE40].map(t => t.constraints.ext), ['.ucf', '.ucf', '.pcf']);
  const src = read('web/js/constraints-format.js');
  assert.match(src, /export const constraintsExt = device => constraintsExtOf\(device\);/);
  // (the experimental family's descriptor: its constraints XDC, #3142)
  assert.deepEqual(NO_FLOW.constraints, { format: 'xdc', ext: '.xdc', label: 'XDC' });
});

test('#3142 an experimental family\'s tool: no step, no report, nothing to program; its tree the constraints and the checks', () => {
  // (the Artix-7's in the browser edition: the Silinx toolchain's since #3143, whatever the project's synthesis tool; on the local
  // server it is Vivado's, #1649: no family is left with NO_FLOW, kept for the next experimental one)
  for (const part of ['xc7a35t', 'xc7a100t']) for (const open of [false, true]) assert.equal(toolOf({ part }, open, { standalone: true }), SILINX_XC7, part);
  assert.equal(toolOf({ part: 'xc7k70t' }, false), ISE, 'another 7-series family: ISE\'s as before');
  assert.deepEqual([NO_FLOW.steps, NO_FLOW.reports, NO_FLOW.program, NO_FLOW.open], [[], [], null, false]);
  assert.deepEqual(built(NO_FLOW).map(shape), ['summary', 'constraints', 'rtl', 'check', 'emulate']);   // (#3704: Emulate needs no flow)
  assert.deepEqual(NO_FLOW.tasks.map(t => t.id), ['edit', 'sim', 'emu']);
  assert.ok(!TOOLS.includes(NO_FLOW) && NO_FLOW.tasks.every(t => allTasks().includes(t)), 'its tasks the others\'');
  assert.equal(hasTask(NO_FLOW, 'impl'), false);
  assert.equal(NO_FLOW.messages.line, MESSAGE_LINE);
});

test('#3780 a design and simulation project\'s tool: Check Design alone, the tasks Design and Simulate, whatever its device', () => {
  for (const part of ['xc3s250e', 'xc7a35t', 'ice40up5k']) for (const open of [false, true]) assert.equal(toolOf({ part }, open, { designOnly: true }), DESIGN_ONLY, part);
  assert.deepEqual([DESIGN_ONLY.steps, DESIGN_ONLY.reports, DESIGN_ONLY.program, DESIGN_ONLY.constraints, DESIGN_ONLY.open], [[], [], null, null, false]);
  assert.deepEqual(built(DESIGN_ONLY).map(shape), ['check']);
  assert.equal(DESIGN_ONLY.tree[0].label, 'Check Design');
  assert.deepEqual(DESIGN_ONLY.tasks.map(t => t.id), ['edit', 'sim']);
  assert.ok(!TOOLS.includes(DESIGN_ONLY) && DESIGN_ONLY.tasks.every(t => allTasks().includes(t)), 'its tasks the others\'');
  assert.deepEqual(['emu', 'impl'].map(id => hasTask(DESIGN_ONLY, id)), [false, false]);
  assert.equal(DESIGN_ONLY.messages.line, MESSAGE_LINE);
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
  // (#2298: the open families' page, its tab's title its programming's, and the others' iMPACT; each open family's target
  // its profile's)
  assert.deepEqual([ISE, SILINX, SILINX_ICE40, SILINX_ECP5, SILINX_GOWIN].map(t => [t.program.page, t.program.title, t.program.target]),
    [['impact', 'iMPACT', 'jtag'], ['impact', 'iMPACT', 'jtag'], ['program-open', 'Program Flash', 'spi-flash'], ['program-open', 'Program FPGA', 'sram'], ['program-open', 'Program FPGA', 'sram']]);
  assert.deepEqual(['ice40', 'ecp5', 'gowin'].map(f => familyProfile(f).program), ['spi-flash', 'sram', 'sram']);
  for (const tool of [SILINX_ECP5, SILINX_GOWIN]) assert.ok(tool.steps.find(s => s.id === 'bitgen').produces.includes(tool.program.file), tool.id);
  assert.ok(fs.existsSync(new URL('../web/js/program-open.js', import.meta.url)));
  assert.match(read('web/js/app.js'), /projectTool\(\)\.program\?\.title \|\| 'iMPACT' : 'iMPACT'/);
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
  assert.deepEqual(imports, ['../../packages/silinx-fpga/src/parts.js']);   // (#1649's vivadoDevice too: the light entry's)
});

test('#2311 the mechanism of the disabled process is gone: absent, not disabled', () => {
  const src = read('web/js/processes.js');
  assert.doesNotMatch(src, /ISE_ONLY|forOpenMode|OPEN_ONLY_ABSENT/);
  assert.match(src, /buildProcesses\(projectTool\(\)/);
});

test('#1649 AMD Vivado on the Artix-7 (the local server): ISE\'s step names, Vivado\'s products and reports, no simulation model; Emulate (#3704); the other families as before', () => {
  for (const part of ['xc7a35t', 'xc7a100t']) assert.equal(toolOf({ part }, false), VIVADO, part);   // (open: the Silinx toolchain's, #3146)
  for (const part of ['xc7k70t', 'xc7z020']) assert.equal(toolOf({ part }, false), ISE, part);
  assert.equal(toolOf({ part: 'xc3s250e' }, true, { standalone: false }), SILINX);
  const t = built(VIVADO);
  assert.deepEqual(t.map(shape), ['summary', 'constraints', { synth: ['rtl', 'check', 'cmodel'] },
    { impl: [{ translate: [] }, { map: [] }, { par: ['trce', 'xpwr', 'pin2ucf'] }] }, 'bitgen', 'emulate', { config: ['impact'] }]);
  assert.equal(find(t, 'synth').label, 'Synthesize - Vivado');
  for (const id of ['synth', 'impl', 'bitgen']) assert.equal(find(t, id).title, 'AMD Vivado', id);
  assert.deepEqual(VIVADO.steps.map(s => s.id), ['synth', 'translate', 'map', 'par', 'trce', 'pin2ucf', 'xpwr', 'bitgen']);
  assert.ok(orderSteps(VIVADO.steps, ['bitgen']).includes('par'));
  // what each step produces: run.tcl's files (server/vivado.js)
  const tcl = read('server/vivado.js');
  for (const s of VIVADO.steps) for (const f of s.produces) assert.ok(tcl.includes(f.replace(/^\{top\}/, '')), `${s.id}: ${f}`);
  for (const r of VIVADO.reports) assert.ok(VIVADO.steps.find(s => s.id === r.step).produces.includes(r.file), r.id);
  assert.deepEqual([VIVADO.constraints.format, VIVADO.program.file, VIVADO.program.prom, VIVADO.open], ['xdc', '{top}.bit', undefined, false]);
  assert.ok(find(VIVADO.tree, VIVADO.program.process));
  assert.deepEqual(VIVADO.tasks.map(x => x.id), ['edit', 'sim', 'emu', 'impl']);
  assert.equal(hasTask(VIVADO, 'emu'), true);
  assert.ok(VIVADO.tasks.every(x => allTasks().includes(x)), 'its tasks the others\'');
  assert.equal(VIVADO.messages.line, MESSAGE_LINE);
  // the run of each node: the chain up to its step
  assert.deepEqual(find(t, 'bitgen').run(), ['synth', 'translate', 'map', 'par', 'bitgen']);
});

test('#3146 the Silinx toolchain on the Artix-7 (the project\'s synthesis tool Silinx, the local server): its steps, its reports, the timing nextpnr\'s; no simulation model, no view; Emulate (#3704)', () => {
  for (const part of ['xc7a35t', 'xc7a100t']) {
    assert.equal(toolOf({ part }, true), SILINX_XC7, part);
    assert.equal(toolOf({ part }, true, { standalone: true }), SILINX_XC7, `${part}: in the browser edition too (#3143)`);
    assert.equal(toolOf({ part }, false), VIVADO, `${part}: Vivado's on the local server, the project's synthesis tool not Silinx`);
  }
  for (const part of ['xc7k70t', 'xc7z020']) assert.equal(toolOf({ part }, true), SILINX, `${part}: not the 7-series back end's`);
  const t = built(SILINX_XC7);
  assert.deepEqual(t.map(shape), ['summary', 'constraints', { synth: ['rtl', 'check', 'cmodel'] },
    { impl: [{ translate: [] }, { par: ['trce'] }] }, 'bitgen', 'emulate', { config: ['impact'] }]);
  assert.equal(find(t, 'synth').label, 'Synthesize - Yosys');
  assert.deepEqual(find(t, 'bitgen').run(), ['synth', 'translate', 'map', 'par', 'bitgen']);   // (the server's list maps in Place & Route)
  assert.deepEqual(orderSteps(XC7_STEPS, ['synth', 'translate', 'map', 'par', 'bitgen']), ['synth', 'translate', 'par', 'bitgen']);
  // what each step produces: the back end's files (open-flow-xc7.js)
  const src = read('packages/silinx-fpga/src/open-flow-xc7.js');
  for (const f of ['open/routed.fasm', 'open/nextpnr-report.json', 'open/timing.txt', '`${top}.bit`']) assert.ok(src.includes(f), f);
  for (const r of SILINX_XC7.reports) assert.ok(SILINX_XC7.steps.find(s => s.id === r.step).produces.includes(r.file), r.id);
  assert.ok(SILINX_XC7.tasks.every(x => allTasks().includes(x)), 'its tasks the others\'');
  assert.deepEqual(SILINX_XC7.reports.map(r => r.label), ['Synthesis Report (Yosys)', 'Routed Design (FASM)', 'Static Timing Report']);
  assert.deepEqual([SILINX_XC7.constraints.format, SILINX_XC7.program.file, SILINX_XC7.program.page, SILINX_XC7.open], ['xdc', '{top}.bit', 'impact', true]);
  assert.deepEqual(SILINX_XC7.tasks.map(x => x.id), ['edit', 'sim', 'emu', 'impl']);
  assert.equal(SILINX_XC7.messages.line, MESSAGE_LINE);
});

test('#3704 Emulate in every flow, on the HDL and the board\'s pins; its models the ones the tool generates (none with no netgen)', () => {
  for (const tool of [...TOOLS, SILINX_XC7, VIVADO, SILINX_ECP5, SILINX_GOWIN, NO_FLOW]) {
    assert.ok(hasTask(tool, 'emu'), `${tool.id}: the Emulate task`);
    assert.ok(tool.tree.some(n => n.part === 'emulate'), `${tool.id}: Emulate on Board`);
  }
  assert.deepEqual(simModelsOf(ISE), ['postsynth', 'posttrans', 'postmap', 'postpar']);
  assert.deepEqual(simModelsOf(SILINX), ['postsynth', 'posttrans', 'postmap', 'postpar']);
  for (const tool of [SILINX_ICE40, SILINX_XC7, VIVADO, SILINX_ECP5, SILINX_GOWIN, NO_FLOW]) assert.deepEqual(simModelsOf(tool), [], tool.id);
});
