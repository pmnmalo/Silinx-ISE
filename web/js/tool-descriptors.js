// The tool descriptors (#2311, the plan #2315): what each back end does, as data. One per back end: ISE, the Silinx
// toolchain on the Xilinx families, the Silinx toolchain on the iCE40, the ECP5 and the Gowin (nextpnr); and an experimental family's, none yet
// (#3142: the 7-series, its flows to come, Vivado #1649 and the Silinx toolchain #3146). Each says
// - steps: its steps (id, label, needs: the back end's own list) and what each produces, `{top}` the top module;
// - reports: the reports of the Design Summary, each of a step;
// - constraints: its constraints' format;
// - messages: how the lines of its log are read;
// - program: how a board is programmed;
// - tree: the implementation's part of the process tree (buildProcesses gives its nodes what they run);
// - tasks: the tasks of the Tasks interface, each with its main action and its state dot's processes.
// What a tool does not have is not in its descriptor, and so not in the interface. No DOM here: unit tested
// (test/tool-descriptors.test.js).
import { deviceFamily, experimentalDevice, vivadoDevice } from '../../packages/silinx-fpga/src/parts.js';

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
    // the logic analyzer (#3176: the Silinx toolchain's, which inserts its core at Implement; ISE's tree has ChipScope)
    proc('capture', 'Analyze Design Using the Logic Analyzer', { ico: 'wave' }, [
      proc('capture-settings', 'Logic Analyzer Settings', { ico: 'process' }),
      proc('capture-view', 'View the Last Capture', { ico: 'wave' }),
    ]),
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

// the back ends' lists of steps (the toolchain's open-steps.js XILINX_STEPS, open-flow-ice40.js ICE40_STEPS, open-flow-ecp5.js ECP5_STEPS, open-flow-gowin.js GOWIN_STEPS: the same,
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
  step('trce', 'Generate Post-Place & Route Static Timing', ['par']),
  step('bitgen', 'Generate Programming File - icepack', ['par']),
];
// (the 7-series', open-flow-xc7.js XC7_STEPS, #3146)
const XC7_STEPS = [
  step('synth', 'Synthesize - Yosys'),
  step('translate', 'Translate', ['synth']),
  step('par', 'Place & Route - nextpnr', ['translate']),
  step('trce', 'Generate Post-Place & Route Static Timing', ['par']),
  step('bitgen', 'Generate Programming File', ['par']),
];
const ECP5_STEPS = [
  step('synth', 'Synthesize - Yosys'),
  step('translate', 'Translate', ['synth']),
  step('par', 'Place & Route - nextpnr', ['translate']),
  step('trce', 'Generate Post-Place & Route Static Timing', ['par']),
  step('bitgen', 'Generate Programming File - ecppack', ['par']),
];
const GOWIN_STEPS = [
  step('synth', 'Synthesize - Yosys'),
  step('translate', 'Translate', ['synth']),
  step('par', 'Place & Route - nextpnr', ['translate']),
  step('trce', 'Generate Post-Place & Route Static Timing', ['par']),
  step('bitgen', 'Generate Programming File - gowin_pack', ['par']),
];
const withProducts = (steps, products) => steps.map(s => ({ ...s, produces: products[s.id] || [] }));

const UCF = { format: 'ucf', ext: '.ucf', label: 'UCF' };
const PCF = { format: 'pcf', ext: '.pcf', label: 'PCF' };
const LPF = { format: 'lpf', ext: '.lpf', label: 'LPF' };
const CST = { format: 'cst', ext: '.cst', label: 'CST' };
const XDC = { format: 'xdc', ext: '.xdc', label: 'XDC' };

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
  tree: treeOf(['capture']),
  tasks: LAB_TASKS,
};

/** The Silinx toolchain on the Xilinx families: ISE's steps and names, Yosys its synthesis. */
export const SILINX = {
  id: 'silinx', name: 'Silinx toolchain', open: true,
  steps: withProducts(XILINX_STEPS, {
    synth: ['open/{top}.json', 'open/{top}_stat.txt'], postsynth: ['netgen/synthesis/{top}_synthesis.vhd'],
    posttrans: ['netgen/translate/{top}_translate.vhd'], postmap: ['netgen/map/{top}_map.vhd'], postpar: ['netgen/par/{top}_timesim.vhd'],
    par: ['open/placed.xdl', 'open/routed.xdl'], trce: ['open/timing.txt', 'open/paths.json'],
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
    synth: ['open/{top}.json', 'open/{top}_stat.txt'], par: ['open/routed.asc', 'open/nextpnr-report.json'], trce: ['open/timing.txt', 'open/paths.json'], bitgen: ['{top}.bin'],
  }),
  reports: [
    { id: 'synthesis', label: 'Synthesis Report (Yosys)', step: 'synth', file: 'open/{top}_stat.txt' },
    { id: 'routed', label: 'Routed Design (ASC)', step: 'par', file: 'open/routed.asc' },
    { id: 'timing', label: 'Static Timing Report', step: 'trce', file: 'open/timing.txt' },
  ],
  constraints: PCF,
  messages: LOG_MESSAGES,
  // (#2298: no JTAG chain and no PROM; the .bin written into the board's SPI flash: openFPGALoader in the local server, WebUSB
  // in the browser edition; the page web/js/program-open.js, as the ECP5's and the Gowin's)
  program: { process: 'config', page: 'program-open', title: 'Program Flash', target: 'spi-flash', file: '{top}.bin' },
  tree: treeOf(['synth-open', 'map', 'xpwr', 'postsynth', 'posttrans', 'postmap', 'postpar', 'pin2ucf', 'fpgaview', 'tech', 'capture'], SILINX_CHANGE),
  tasks: LAB_TASKS,
};

/** The Silinx toolchain on the 7-series (#3146, an experimental family: the Artix-7 of the Basys 3), with nextpnr and the bitstream
 *  from its FASM: nextpnr maps in its Place & Route, its timing is nextpnr's estimate; no simulation models, no views of the
 *  routed design; Emulate, the board's emulator on the HDL and the XDC's pins (#3704); the board programmed as Vivado's .bit is (iMPACT's page).
 *  The local server's only: the browser edition has NO_FLOW. */
export const SILINX_XC7 = {
  id: 'silinx-xc7', name: 'Silinx toolchain (7-series, on trial)', open: true,
  steps: withProducts(XC7_STEPS, {
    synth: ['open/{top}.json', 'open/{top}_stat.txt'], par: ['open/routed.fasm', 'open/nextpnr-report.json'], trce: ['open/timing.txt'], bitgen: ['{top}.bit'],
  }),
  reports: [
    { id: 'synthesis', label: 'Synthesis Report (Yosys)', step: 'synth', file: 'open/{top}_stat.txt' },
    { id: 'routed', label: 'Routed Design (FASM)', step: 'par', file: 'open/routed.fasm' },
    { id: 'timing', label: 'Static Timing Report', step: 'trce', file: 'open/timing.txt' },
  ],
  constraints: XDC,
  messages: LOG_MESSAGES,
  program: { process: 'config', page: 'impact', title: 'iMPACT', target: 'jtag', file: '{top}.bit' },
  tree: treeOf(['synth-open', 'map', 'xpwr', 'postsynth', 'posttrans', 'postmap', 'postpar', 'pin2ucf', 'fpgaview', 'tech', 'capture'], SILINX_CHANGE),
  tasks: LAB_TASKS,
};

/** The Silinx toolchain on the ECP5 (#2302), with nextpnr-ecp5 and ecppack (Project Trellis): as the iCE40's, its bitstream
 *  ecppack's .bit, loaded into the FPGA's SRAM by Configure Target Device (#2298: no JTAG chain, the board's); Emulate on the
 *  LPF's pins (#3704). */
export const SILINX_ECP5 = {
  id: 'silinx-ecp5', name: 'Silinx toolchain (ECP5)', open: true,
  steps: withProducts(ECP5_STEPS, {
    synth: ['open/{top}.json', 'open/{top}_stat.txt'], par: ['open/routed.config', 'open/nextpnr-report.json'], trce: ['open/timing.txt', 'open/paths.json'], bitgen: ['{top}.bit'],
  }),
  reports: [
    { id: 'synthesis', label: 'Synthesis Report (Yosys)', step: 'synth', file: 'open/{top}_stat.txt' },
    { id: 'routed', label: 'Routed Design (Trellis configuration)', step: 'par', file: 'open/routed.config' },
    { id: 'timing', label: 'Static Timing Report', step: 'trce', file: 'open/timing.txt' },
  ],
  constraints: LPF,
  messages: LOG_MESSAGES,
  program: { process: 'config', page: 'program-open', title: 'Program FPGA', target: 'sram', file: '{top}.bit' },
  tree: treeOf(['synth-open', 'map', 'xpwr', 'postsynth', 'posttrans', 'postmap', 'postpar', 'pin2ucf', 'fpgaview', 'tech', 'capture'], SILINX_CHANGE),
  tasks: LAB_TASKS,
};

/** The Silinx toolchain on the Gowin (#2303), with nextpnr-himbaechel-gowin (Project Apicula) and gowin_pack (Silinx's port of
 *  Apicula's): its bitstream the .fs, loaded into the FPGA's SRAM by Configure Target Device (#2298); Emulate on the CST's pins
 *  (#3704). */
export const SILINX_GOWIN = {
  id: 'silinx-gowin', name: 'Silinx toolchain (Gowin)', open: true,
  steps: withProducts(GOWIN_STEPS, { synth: ['open/{top}.json', 'open/{top}_stat.txt'], par: ['open/routed.json', 'open/nextpnr-report.json'], trce: ['open/timing.txt', 'open/paths.json'], bitgen: ['{top}.fs'] }),
  reports: [
    { id: 'synthesis', label: 'Synthesis Report (Yosys)', step: 'synth', file: 'open/{top}_stat.txt' },
    { id: 'routed', label: 'Routed Design (nextpnr JSON)', step: 'par', file: 'open/routed.json' },
    { id: 'timing', label: 'Static Timing Report', step: 'trce', file: 'open/timing.txt' },
  ],
  constraints: CST,
  messages: LOG_MESSAGES,
  program: { process: 'config', page: 'program-open', title: 'Program FPGA', target: 'sram', file: '{top}.fs' },
  tree: treeOf(['synth-open', 'map', 'xpwr', 'postsynth', 'posttrans', 'postmap', 'postpar', 'pin2ucf', 'fpgaview', 'tech', 'capture'], SILINX_CHANGE),
  tasks: LAB_TASKS,
};

/** An experimental family's (#3142): its constraints (XDC) and the design's checks, no implementation, no programming yet:
 *  no step, no report, and the tasks without Implement; Emulate, which needs no flow (the HDL on the board's pins, #3704). */
export const NO_FLOW = {
  id: 'no-flow', name: 'No implementation flow yet (experimental family)', open: false,
  steps: [], reports: [],
  constraints: XDC,
  messages: LOG_MESSAGES,
  program: null,
  tree: [{ part: 'summary' }, { part: 'constraints' }, proc('rtl', 'View RTL Schematic', { ico: 'schematic' }), proc('check', 'Check Syntax'), { part: 'emulate' }],
  tasks: LAB_TASKS.filter(t => t.id !== 'impl'),
};

/** A design and simulation project's (#3780, core/project-kind.js: no FPGA): no flow, no constraints, no board, no programming;
 *  its tree Check Design alone, its tasks Design and Simulate. */
export const DESIGN_ONLY = {
  id: 'design-only', name: 'Design and simulation only (no FPGA)', open: false,
  steps: [], reports: [],
  constraints: null,
  messages: LOG_MESSAGES,
  program: null,
  tree: [proc('check', 'Check Design')],
  tasks: LAB_TASKS.filter(t => t.id === 'edit' || t.id === 'sim'),
};

/** AMD Vivado on the 7-series (#1649, server/vivado.js): ISE's step names, each a Vivado command (synth_design, opt_design as
 *  Map, place_design and route_design, report_timing_summary, report_io, report_power, write_bitstream), no simulation models,
 *  no technology schematic, no FPGA view; its reports Vivado's; the board programmed with openFPGALoader (iMPACT's page);
 *  Emulate, the board's emulator on the HDL and the XDC's pins (#3704). The local server's only: the browser edition has NO_FLOW. */
export const VIVADO = {
  id: 'vivado', name: 'AMD Vivado', open: false,
  steps: withProducts([step('synth', 'Synthesize - Vivado'), step('translate', 'Translate', ['synth']), step('map', 'Map', ['translate']), step('par', 'Place & Route', ['map']),
    step('trce', EXTRA_STEPS.trce, ['par']), step('pin2ucf', EXTRA_STEPS.pin2ucf, ['par']), step('xpwr', EXTRA_STEPS.xpwr, ['par']), step('bitgen', 'Generate Programming File', ['par'])], {
    synth: ['post_synth.dcp', '{top}_synth_util.rpt'], map: ['post_opt.dcp'], par: ['post_route.dcp', '{top}_route.rpt', '{top}_drc.rpt', '{top}_util.rpt'],
    trce: ['{top}_timing.rpt'], pin2ucf: ['{top}_io.rpt'], xpwr: ['{top}_power.rpt'], bitgen: ['{top}.bit'],
  }),
  reports: [
    { id: 'synthesis', label: 'Synthesis Utilization Report', step: 'synth', file: '{top}_synth_util.rpt' },
    { id: 'map', label: 'Utilization Report', step: 'par', file: '{top}_util.rpt' },
    { id: 'par', label: 'Route Status Report', step: 'par', file: '{top}_route.rpt' },
    { id: 'drc', label: 'DRC Report', step: 'par', file: '{top}_drc.rpt' },
    { id: 'timing', label: 'Timing Summary Report', step: 'trce', file: '{top}_timing.rpt' },
  ],
  constraints: XDC,
  messages: LOG_MESSAGES,
  program: { process: 'config', page: 'impact', title: 'iMPACT', target: 'jtag', file: '{top}.bit' },
  tree: treeOf(['synth-open', 'tech', 'postsynth', 'posttrans', 'postmap', 'postpar', 'fpgaview', 'capture'], { synth: { label: 'Synthesize - Vivado', title: 'AMD Vivado' }, impl: { title: 'AMD Vivado' }, bitgen: { title: 'AMD Vivado' } }),
  tasks: LAB_TASKS,
};

// (the tools that implement with every task of a lab session: NO_FLOW's, VIVADO's and SILINX_XC7's are some of theirs)
export const TOOLS = [ISE, SILINX, SILINX_ICE40];
const OPEN_BY_FAMILY = { ice40: SILINX_ICE40, artix7: SILINX_XC7, ecp5: SILINX_ECP5, gowin: SILINX_GOWIN };
/** The tool of a project device: a 7-series one's AMD Vivado on the local server (#1649), or the Silinx toolchain there when
 *  `open` (the project's synthesis tool Silinx, #3146), and always in the browser edition (`standalone`, #3143); another
 *  experimental family's none yet; `open`, the Silinx toolchain (its back end by the family), else ISE; a design and simulation
 *  project's (`designOnly`, #3780) DESIGN_ONLY whatever its device. */
export const toolOf = (device, open, { standalone = false, designOnly = false } = {}) => (designOnly ? DESIGN_ONLY : vivadoDevice(device) ? (open || standalone ? SILINX_XC7 : VIVADO)
  : experimentalDevice(device) ? NO_FLOW : open ? OPEN_BY_FAMILY[deviceFamily(device)] || SILINX : ISE);

/** Every tool's tasks, in their order: the kept state's and the switchers'. */
export const allTasks = (tools = TOOLS) => [...new Map(tools.flatMap(t => t.tasks).map(t => [t.id, t])).values()];
export const hasTask = (tool, id) => tool.tasks.some(t => t.id === id);
/** The simulation models a tool generates, its tree's (#3704: the emulator's models, none in the flows with no netgen):
 *  ['postsynth', 'posttrans', 'postmap', 'postpar'] or some of them. */
export const simModelsOf = (tool) => {
  const ids = new Set(), walk = ns => ns.forEach(n => { if (n.id) ids.add(n.id); if (n.children) walk(n.children); });
  walk(tool.tree);
  return ['postsynth', 'posttrans', 'postmap', 'postpar'].filter(id => ids.has(id));
};

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
