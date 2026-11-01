// The tool descriptors (#2311, the plan #2315): what each back end does, as data. One per back end: ISE, the Silinx
// toolchain on the Xilinx families, the Silinx toolchain on the iCE40 (nextpnr). Each says
// - steps: its steps (id, label, needs: the back end's own list) and what each produces, `{top}` the top module;
// - reports: the reports of the Design Summary, each of a step;
// - constraints: its constraints' format;
// - messages: how the lines of its log are read;
// - program: how a board is programmed;
// - tree: the implementation's part of the process tree (buildProcesses gives its nodes what they run);
// - tasks: the tasks of the Tasks interface, each with its main action and its state dot's processes.
// What a tool does not have is not in its descriptor, and so not in the interface. No DOM here: unit tested
// (test/tool-descriptors.test.js).
import { deviceFamily } from '../../packages/silinx-fpga/src/parts.js';

export const OPEN_SYNTH = 'Synthesize - Yosys';
export const SYNTH_OPEN = 'Synthesize - Yosys (open)';   // (ISE's tree: the open synthesis beside XST's)
// optional steps of the ISE flow: process label (ISE names) and what they produce
export const EXTRA_STEPS = {
  postsynth: 'Generate Post-Synthesis Simulation Model', posttrans: 'Generate Post-Translate Simulation Model',
  postmap: 'Generate Post-Map Simulation Model', postpar: 'Generate Post-Place & Route Simulation Model',
  pin2ucf: 'Back-annotate Pin Locations', xpwr: 'Generate Text Power Report', trce: 'Generate Post-Place & Route Static Timing',
  fpgaview: 'View Implemented Design (FPGA)',
};
// the implementation runs (one build directory: exclusive), and every process whose mark is kept in the build folder
export const FLOW_PROCS = ['synth', 'impl', 'translate', 'map', 'par', 'bitgen'];
export const IMPL_IDS = ['synth', 'translate', 'map', 'par', 'impl', 'bitgen', 'postsynth', 'posttrans', 'postmap', 'postpar', 'pin2ucf', 'xpwr', 'trce', 'fpgaview'];

// a run is the chain up to its last step (a list without Map maps in its Place & Route: open-steps.js orderSteps)
const CHAIN = ['synth', 'translate', 'map', 'par', 'bitgen'];
const upTo = step => CHAIN.slice(0, CHAIN.indexOf(step) + 1);

// the tree of the Xilinx flow, ISE's names. A node: `flow`, the steps it runs; `part`, a part of the interface's own
// (the Design Summary, the User Constraints, the Board Emulator); else what it runs is the action of its id; `optional`,
// not every source or interface has that action (the node is left out then).
const proc = (id, label, more = {}, children) => ({ id, label, ico: 'process', ...more, ...(children && { children }) });
const simModel = (id, onTop) => proc(id, EXTRA_STEPS[id], { onTop, optional: true });
const implement = { onTop: 'implements' };
const XILINX_TREE = [
  { part: 'summary' },
  { part: 'constraints' },
  proc('synth', 'Synthesize - XST', { onTop: 'synthesizes', flow: upTo('synth') }, [
    proc('rtl', 'View RTL Schematic', { ico: 'schematic' }),
    proc('tech', 'View Technology Schematic', { ico: 'schematic', onTop: 'synthesizes' }),
    proc('check', 'Check Syntax'),
    proc('cmodel', 'View C Model', { optional: true }),
    simModel('postsynth', 'synthesizes'),
  ]),
  proc('synth-open', SYNTH_OPEN, { onTop: 'synthesizes' }),
  proc('impl', 'Implement Design', { ...implement, flow: upTo('par') }, [
    proc('translate', 'Translate', { ...implement, flow: upTo('translate') }, [simModel('posttrans', 'implements')]),
    proc('map', 'Map', { ...implement, flow: upTo('map') }, [simModel('postmap', 'implements')]),
    proc('par', 'Place & Route', { ...implement, flow: upTo('par') }, [
      proc('trce', EXTRA_STEPS.trce, implement),
      proc('xpwr', EXTRA_STEPS.xpwr, implement),
      simModel('postpar', 'implements'),
      proc('pin2ucf', EXTRA_STEPS.pin2ucf, implement),
      proc('fpgaview', EXTRA_STEPS.fpgaview, { ...implement, ico: 'chip' }),
    ]),
  ]),
  proc('bitgen', 'Generate Programming File', { ...implement, flow: upTo('bitgen') }),
  { part: 'emulate' },
  proc('config', 'Configure Target Device', { ico: 'impact' }, [
    proc('impact', 'Manage Configuration Project (iMPACT)', { ico: 'impact' }),
  ]),
];
/** A tree with the nodes `absent` left out and the nodes `change` ({ id: fields }) changed. */
function treeOf(absent, change = {}) {
  const conv = n => {
    if (absent.includes(n.id)) return null;
    return { ...n, ...change[n.id], ...(n.children && { children: n.children.map(conv).filter(Boolean) }) };
  };
  return XILINX_TREE.map(conv).filter(Boolean);
}
const SILINX_TIP = 'Silinx toolchain (no ISE)';
const SILINX_CHANGE = { synth: { label: OPEN_SYNTH, title: SILINX_TIP }, impl: { title: SILINX_TIP }, bitgen: { title: SILINX_TIP } };

// The tasks of a lab session (#782): every tool's so far. step: the design-flow button of the Silinx toolbar (web/js/menus.js,
// data-step); action: its name; dots: the processes that say the task's state.
const LAB_TASKS = [
  // (the first task is Design, its id 'edit' kept: the kept state, the documents; 'Design' in Portuguese too, #1046)
  { id: 'edit', label: 'Design', step: 'check', action: 'Check', hint: 'Open a source from the Design panel.', dots: ['check'] },   // (no Check here: Check Design is under the tree, #1349)
  { id: 'sim', label: 'Simulate', step: 'simulate', action: 'Simulate', hint: 'Simulate the design: its waves open here.', dots: ['sim-check'] },
  { id: 'emu', label: 'Emulate', step: 'emulate', action: 'Emulate', hint: 'Emulate the design on the board: the board opens here.', dots: [] },
  { id: 'impl', label: 'Implement', step: 'implement', action: 'Implement', hint: 'Implement the design: synthesis, place & route and the programming file.', dots: ['synth', 'synth-open', 'translate', 'map', 'par', 'bitgen'] },
];

// The log's lines, every tool's so far (run.sh's and the Silinx toolchain's): "ERROR:Tool:123 - msg", "WARNING:Tool - msg",
// "ERROR: msg", "WARNING: msg"; a step's start and end said by the markers.
export const MESSAGE_LINE = /^\s*(ERROR|WARNING|FATAL|CRITICAL WARNING)\s*:\s*(?:([A-Za-z][\w-]*(?::\d+)?)\s+-\s+)?(.*)$/i;
const LOG_MESSAGES = { line: MESSAGE_LINE, stepStart: '=== SILINX STEP', stepFailed: '=== SILINX FAILED', done: '=== SILINX DONE ===' };

// the back ends' lists of steps (the toolchain's open-steps.js XILINX_STEPS, open-flow-ice40.js ICE40_STEPS: the same,
// test/tool-descriptors.test.js; the interface loads none of the toolchain behind them, #1678)
const step = (id, label, needs = []) => ({ id, label, needs });
const XILINX_STEPS = [
  step('synth', 'Synthesize - Yosys'),
  step('postsynth', 'Generate Post-Synthesis Simulation Model'),
  step('translate', 'Translate', ['synth']),
  step('posttrans', 'Generate Post-Translate Simulation Model', ['translate']),
  step('map', 'Map', ['translate']),
  step('postmap', 'Generate Post-Map Simulation Model', ['map']),
  step('par', 'Place & Route', ['map']),
  step('trce', 'Generate Post-Place & Route Static Timing', ['par']),
  step('postpar', 'Generate Post-Place & Route Simulation Model', ['par']),
  step('pin2ucf', 'Back-annotate Pin Locations', ['par']),
  step('xpwr', 'Generate Text Power Report', ['par']),
  step('bitgen', 'Generate Programming File', ['par']),
  step('prombit', 'Generate PROM File', ['par']),
  step('fpgaview', 'View Implemented Design (FPGA)', ['par']),
];
const ICE40_STEPS = [
  step('synth', 'Synthesize - Yosys'),
  step('translate', 'Translate', ['synth']),
  step('par', 'Place & Route - nextpnr', ['translate']),
  step('bitgen', 'Generate Programming File - icepack', ['par']),
];
const withProducts = (steps, products) => steps.map(s => ({ ...s, produces: products[s.id] || [] }));

const UCF = { format: 'ucf', ext: '.ucf', label: 'UCF' };
const PCF = { format: 'pcf', ext: '.pcf', label: 'PCF' };

/** Xilinx ISE 14.7. */
export const ISE = {
  id: 'ise', name: 'Xilinx ISE', open: false,
  steps: withProducts(XILINX_STEPS.map(s => (s.id === 'synth' ? { ...s, label: 'Synthesize - XST' } : s)), {
    synth: ['{top}.ngc', '{top}.syr'], postsynth: ['netgen/synthesis/{top}_synthesis.vhd'],
    translate: ['{top}.ngd'], posttrans: ['netgen/translate/{top}_translate.vhd'],
    map: ['{top}_map.ncd', '{top}_map.mrp'], postmap: ['netgen/map/{top}_map.vhd'],
    par: ['{top}.ncd', '{top}.par'], trce: ['{top}.twr'], postpar: ['netgen/par/{top}_timesim.vhd'],
    pin2ucf: ['{top}_pins.ucf'], xpwr: ['{top}.pwr'], bitgen: ['{top}.bit'], prombit: ['{top}_prom.bit'], fpgaview: ['{top}.xdl'],
  }),
  reports: [
    { id: 'synthesis', label: 'Synthesis Report', step: 'synth', file: '{top}.syr' },
    { id: 'map', label: 'Map Report', step: 'map', file: '{top}_map.mrp' },
    { id: 'par', label: 'Place and Route Report', step: 'par', file: '{top}.par' },
    { id: 'timing', label: 'Static Timing Report', step: 'trce', file: '{top}.twr' },
  ],
  constraints: UCF,
  messages: LOG_MESSAGES,
  program: { process: 'config', page: 'impact', title: 'iMPACT', target: 'jtag', file: '{top}.bit', prom: '{top}_prom.bit' },
  tree: treeOf([]),
  tasks: LAB_TASKS,
};

/** The Silinx toolchain on the Xilinx families: ISE's steps and names, Yosys its synthesis. */
export const SILINX = {
  id: 'silinx', name: 'Silinx toolchain', open: true,
  steps: withProducts(XILINX_STEPS, {
    synth: ['open/{top}.json', 'open/{top}_stat.txt'], postsynth: ['netgen/synthesis/{top}_synthesis.vhd'],
    posttrans: ['netgen/translate/{top}_translate.vhd'], postmap: ['netgen/map/{top}_map.vhd'], postpar: ['netgen/par/{top}_timesim.vhd'],
    par: ['open/placed.xdl', 'open/routed.xdl'], trce: ['open/timing.txt'],
    pin2ucf: ['{top}_pins.ucf'], xpwr: ['{top}.pwr'], bitgen: ['{top}.bit'], prombit: ['{top}_prom.bit'],
  }),
  reports: [
    { id: 'synthesis', label: 'Synthesis Report (Yosys)', step: 'synth', file: 'open/{top}_stat.txt' },
    { id: 'placed', label: 'Placed Design (XDL)', step: 'par', file: 'open/placed.xdl' },
    { id: 'routed', label: 'Routed Design (XDL)', step: 'par', file: 'open/routed.xdl' },
    { id: 'timing', label: 'Static Timing Report', step: 'trce', file: 'open/timing.txt' },
  ],
  constraints: UCF,
  messages: LOG_MESSAGES,
  program: { process: 'config', page: 'impact', title: 'iMPACT', target: 'jtag', file: '{top}.bit', prom: '{top}_prom.bit' },
  tree: treeOf(['synth-open'], SILINX_CHANGE),
  tasks: LAB_TASKS,
};

/** The Silinx toolchain on the iCE40 (#2295), with nextpnr and icepack: nextpnr maps in its Place & Route, its report gives
 *  the timing, and the simulation models, the views and the wizards of the UCF read Xilinx's cells. */
export const SILINX_ICE40 = {
  id: 'silinx-ice40', name: 'Silinx toolchain (iCE40)', open: true,
  steps: withProducts(ICE40_STEPS, {
    synth: ['open/{top}.json', 'open/{top}_stat.txt'], par: ['open/routed.asc'], bitgen: ['{top}.bin'],
  }),
  reports: [
    { id: 'synthesis', label: 'Synthesis Report (Yosys)', step: 'synth', file: 'open/{top}_stat.txt' },
    { id: 'routed', label: 'Routed Design (ASC)', step: 'par', file: 'open/routed.asc' },
  ],
  constraints: PCF,
  messages: LOG_MESSAGES,
  // (#2298: no JTAG chain and no PROM; the .bin written into the board's SPI flash: openFPGALoader in the local server, WebUSB
  // in the browser edition)
  program: { process: 'config', page: 'program-ice40', title: 'Program Flash', target: 'spi-flash', file: '{top}.bin' },
  tree: treeOf(['synth-open', 'map', 'trce', 'xpwr', 'postsynth', 'posttrans', 'postmap', 'postpar', 'pin2ucf', 'fpgaview', 'tech'], SILINX_CHANGE),
  tasks: LAB_TASKS,
};

export const TOOLS = [ISE, SILINX, SILINX_ICE40];
const OPEN_BY_FAMILY = { ice40: SILINX_ICE40 };
/** The tool of a project device: `open`, the Silinx toolchain (its back end by the family), else ISE. */
export const toolOf = (device, open) => (open ? OPEN_BY_FAMILY[deviceFamily(device)] || SILINX : ISE);

/** Every tool's tasks, in their order: the kept state's and the switchers'. */
export const allTasks = (tools = TOOLS) => [...new Map(tools.flatMap(t => t.tasks).map(t => [t.id, t])).values()];
export const hasTask = (tool, id) => tool.tasks.some(t => t.id === id);

/**
 * The process tree of a tool: its descriptor's nodes with what they run.
 * parts: the interface's own ({ summary, constraints, emulate }: process definitions); actions: { <id>: run } of the nodes
 * with neither `flow` nor `part`; runFlow(steps): what a `flow` node runs. A node with no action throws, but an `optional` one.
 */
export function buildProcesses(tool, { parts = {}, actions = {}, runFlow }) {
  const conv = ({ part, flow, optional, children, ...n }) => {
    if (part) return parts[part];
    const run = flow ? () => runFlow(flow) : actions[n.id];
    if (!run) { if (optional) return null; throw new Error(`${tool.id}: no action for the process ${n.id}`); }
    return { ...n, run, ...(children && { children: children.map(conv).filter(Boolean) }) };
  };
  return tool.tree.map(conv).filter(Boolean);
}
