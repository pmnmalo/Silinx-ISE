// Silinx toolchain - the flow's back ends, one per family (#2360): what runFlow (open-flow-core.js) asks of a family, so
// that it names none. A back end is { id, mount(ctx), steps?, synth?, synthName?, constraints? }:
//   steps        its steps, [{ id, label, needs }] (#2387): runFlow runs those asked in this order; the Xilinx families'
//                (open-steps.js XILINX_STEPS, ISE's names) when not given
//   mount(ctx)   -> { steps: { id: run() }, packed?, packsAtPar?, routedOrEarlier?, routedText? }: the functions of its steps, with its
//                engines, but the synthesis's and the simulation models' (runFlow's own: synth, postsynth, posttrans, postmap,
//                postpar); ctx: runFlow's (its getters: netlist, netlistText; readNetlist, the netlist read and the
//                constraints checked, for the step that does it). The routed design is the back end's (#2384): its format,
//                its file, an earlier run's read again by the steps that need it; routedOrEarlier and routedText give it to
//                the simulation models; packsAtPar: true when its Place & Route packs (nextpnr's, #2530: the Post-Map model
//                written from the routed design)
//   synth        the synthesis, as synth-open.js synthesizeVerilog (its signature and result): the Xilinx families' that,
//                another family's its own Yosys script (synth-script.js scriptSynthesis, #2386); when not given, Yosys's
//                generic synth into its generic cells
//   synthName(id, resource)  the name of a resource's line in the synthesis's report (resource: resources.js's entry of the
//                part, or undefined): the Spartan-3E's as XST names them; when not given, the resource's report name
//   constraints  the constraints' format (constraints.js, #2385): UCF when not given
// A family not registered is implemented as the Spartan-3E is, with the names of its MAP report: the families only ISE
// implements fail there, as they did, at the device they have no description of.
import { analyzeTiming, checkSwitching } from './fpga/timing.js';
import { bitgen } from './fpga/bitgen.js';
import { analyzeTimingS6 } from './fpga/s6/timing.js';
import { bitstreamS6 } from './fpga/s6/bitgen.js';
import { parseXdl } from './xdl.js';
import { readYosysJson } from './fpga/netlist.js';
import { mountFlowReports } from './open-flow-reports.js';
import { mountS6Steps } from './open-flow-s6.js';
import { mountNextpnrSteps } from './open-flow-nextpnr.js';
import { mountNextpnrS6 } from './open-flow-nextpnr-s6.js';
import { sortedNetlistText } from './fpga/s6/nextpnr-pack.js';
import { synthesizeVerilog } from './synth-open.js';
import { synthesizeArea } from './synth-area.js';
import { synthesizeFast } from './synth-fast.js';
import { scriptSynthesis } from './synth-script.js';
import { XILINX_STEPS } from './open-steps.js';
import { ICE40 } from './open-flow-ice40.js';
import { XC7 } from './open-flow-xc7.js';
import { ECP5 } from './open-flow-ecp5.js';
import { GOWIN } from './open-flow-gowin.js';

const S3E_REPORTS = {
  analyze: analyzeTiming,
  switching: checkSwitching,
  model: 'core/fpga/timing.js',
  // { bytes } of the routed design, or throws naming what the bit database does not have
  bitstream({ io, spec, top, routedText, StepError }, sc) {
    const { bytes, unknown } = bitgen(routedText(), io.bitDb(), { name: `${top}.ncd`, crc: true, startupClk: sc, part: `${spec.device.replace(/^xc/, '')}${spec.pkg}` });
    if (unknown.length) {
      throw new StepError(`${unknown.length} feature(s) of the design are not in the bit database: no bitstream`, unknown.slice(0, 50).map(u => `${u.tile} ${u.feature}`));
    }
    return { bytes };
  },
};

const S6_REPORTS = {
  // (its arcs and delays fitted to ISE's trce, fpga/s6/timing.js, #732)
  analyze: analyzeTimingS6,
  switching: () => [],
  model: 'fpga/s6/timing.js, fitted to ISE\'s trce',
  // (fpga/s6/bitgen.js, byte for byte as ISE's bitgen writes the routed design, #732)
  bitstream({ io, top, routedText, StepError }, sc) {
    const r = bitstreamS6(parseXdl(routedText()), io.device(), io.bitDb(), { name: `${top}.ncd;UserID=0xFFFFFFFF`, crc: true, startupClk: sc });
    if (r.unknown.size) throw new StepError(`${r.unknown.size} feature(s) of the design are not in the bit database: no bitstream`, [...r.unknown.keys()].slice(0, 50));
    return { bytes: r.bytes };
  },
};

// the Xilinx families' routed design: XDL, open/routed.xdl (#2384); Place & Route sets it, the later steps read it
// again from an earlier run
function xdlRouted({ io, StepError }) {
  let text = null;
  return {
    setRouted: t => { text = t; },
    routedText: () => text,
    routedOrEarlier: () => { if (text == null) text = io.read('open/routed.xdl'); if (text == null) throw new StepError('no routed design: run Place & Route first', [], ''); },
  };
}

// the Xilinx families' steps after the synthesis (XILINX_STEPS, ISE's names): Translate reads the netlist, then Map and
// Place & Route (the family's, with its engines), the timing, the pins, the power, the bitstreams and the FPGA view
// the back end's Map and Place & Route of another netlist (the simulation models' design, synthesized with the test
// bench's generics, #122): mount(ctx) gives { runMap, runPar }, on a report and a log of their own, nothing written;
// resolves the routed design's text (#2137: nextpnr's, no longer fpga/place-route.js's)
function placeRouteNetlist(base, mount) {
  return async (text, top) => {
    let routed = null;
    const steps = mount({ ...base, top, netlist: () => readYosysJson(text), netlistText: () => text, report: { files: {} }, log: () => {},
      io: { ...base.io, write: name => name }, setRouted: t => { routed = t; } });
    await steps.runMap();
    await steps.runPar();
    return routed;
  };
}

function xilinxSteps(ctx, runMap, runPar, r) {
  const { top, spec, report, log } = ctx;
  return {
    translate: ctx.readNetlist, map: runMap, par: runPar, trce: r.runTiming, pin2ucf: r.runPins, xpwr: r.runPower, fpgaview: r.runFpgaView,
    bitgen: () => {
      report.bit = r.bitfile(`${top}.bit`, spec.startupClk);
      log(`Bitstream: build/${top}.bit (${report.bit.size} bytes, every feature in the bit database)`);
    },
    prombit: () => {
      report.prom = r.bitfile(`${top}_prom.bit`, 'Cclk');
      log(`PROM bitstream (StartUpClk Cclk): build/${top}_prom.bit`);
    },
  };
}

// nextpnr's Map and Place & Route (#2136: open-flow-nextpnr.js), the one engine (#2137: Silinx's placer and router
// removed); no packed design at Map: nextpnr packs at Place & Route (packsAtPar), the Post-Map model is written from its
// routed design (#2530)
function mountS3e(base) {
  const routed = xdlRouted(base), ctx = { ...base, ...routed };
  const np = mountNextpnrSteps(ctx);
  return {
    steps: xilinxSteps(ctx, () => np.runMap(), () => np.runPar(), mountFlowReports({ ...ctx, reports: S3E_REPORTS })),
    packed: () => null, packsAtPar: true, routedOrEarlier: routed.routedOrEarlier, routedText: routed.routedText,
    placeRouteNetlist: placeRouteNetlist(base, c => mountNextpnrSteps(c)),
  };
}

// the netlist's cells by name when nextpnr packs it (#3138: fpga/s6/nextpnr-pack.js; the default since #3140, unless
// spec.s6Map is 'silinx'), so that Silinx's Map, whose sites nextpnr's placement is read back by, names them as nextpnr's
// packer does
function sortedForNextpnr(base) {
  if (base.spec.s6Map === 'silinx') return base;
  let of = null, text = null, nl = null;
  const sorted = () => { const t = base.netlistText(); if (t !== of) { of = t; text = t == null ? t : sortedNetlistText(t); nl = t == null ? base.netlist() : readYosysJson(text); } };
  return { ...base, netlist: () => { sorted(); return nl; }, netlistText: () => { sorted(); return text; } };
}

// the Spartan-6's Map (#732: open-flow-s6.js) and nextpnr's Place & Route (#2138: open-flow-nextpnr-s6.js), the one
// engine (#2824: Silinx's own router removed); Place & Route alone packs first, as Map would. nextpnr packs Yosys's netlist
// too, into the sites of Silinx's Map (#3138, the default since #3140); with spec.s6Map 'silinx' it places Silinx's sites
function mountS6(b) {
  const base = sortedForNextpnr(b);
  const routed = xdlRouted(base), ctx = { ...base, ...routed };
  const own = mountS6Steps(ctx), np = mountNextpnrS6({ ...ctx, state: own.state });
  const runPar = () => { if (!own.state().phys) own.runMap(); return np.runPar(); };
  return { steps: xilinxSteps(ctx, own.runMap, runPar, mountFlowReports({ ...ctx, reports: S6_REPORTS })),
    routedOrEarlier: routed.routedOrEarlier, routedText: routed.routedText,
    placeRouteNetlist: placeRouteNetlist(base, c0 => { const c = sortedForNextpnr(c0), o = mountS6Steps(c); return { runMap: o.runMap, runPar: mountNextpnrS6({ ...c, state: o.state }).runPar }; }) };
}

// the synthesis's report: its lines as XST names them (the Spartan-3E's), else as the MAP report does (the part's resources)
const XST_NAMES = { luts: 'Number of 4 input LUTs', ffs: 'Number of Slice Flip Flops', ramb16: 'Number of RAMB16s', mult18x18: 'Number of MULT18X18SIOs', bufgmux: 'Number of GCLKs', dcm: 'Number of DCMs', iob: 'Number of IOs' };
const xstName = id => XST_NAMES[id] || id;
const mapName = (id, resource) => resource?.report || XST_NAMES[id] || id;

// (areaSynth, fastSynth: the Optimization Area's and Fast's synthesis, #2470, #3096; a back end with none synthesizes as at the
// other goals, Fast with FAST_SYNTH)
const SPARTAN3E = { id: 'spartan3e', mount: mountS3e, steps: XILINX_STEPS, synth: synthesizeVerilog, areaSynth: synthesizeArea, fastSynth: synthesizeFast, synthName: xstName };
const OTHER = { id: 'other', mount: mountS3e, steps: XILINX_STEPS, synth: synthesizeVerilog, areaSynth: synthesizeArea, fastSynth: synthesizeFast, synthName: mapName };
const backends = new Map([['spartan3e', SPARTAN3E], ['spartan6', { id: 'spartan6', mount: mountS6, steps: XILINX_STEPS, synth: synthesizeVerilog, areaSynth: synthesizeArea, fastSynth: synthesizeFast, synthName: mapName }],
  ['ice40', ICE40], ['artix7', XC7], ['ecp5', ECP5], ['gowin', GOWIN]]);   // (#2295: open-flow-ice40.js; the 7-series', #3146: open-flow-xc7.js; #2302:
  // open-flow-ecp5.js; #2303: open-flow-gowin.js)
// a registered back end's synthesis and report names when it gives none: Yosys's generic synth, its resources' names
const GENERIC_SYNTH = scriptSynthesis({ script: top => `synth -flatten -top ${top}` });
const ownName = (id, resource) => resource?.report || id;

/** The back end of a family. */
export const backendOf = family => backends.get(family) || OTHER;

/** Add a family's back end (its family's id: backend.id); returns the function that takes it away. */
export function registerBackend(backend) {
  if (typeof backend?.mount !== 'function' || !backend.id) throw new Error('a back end needs an id and mount(ctx)');
  if (backends.has(backend.id)) throw new Error(`the family ${backend.id} has its back end`);
  backends.set(backend.id, { steps: XILINX_STEPS, synth: GENERIC_SYNTH, synthName: ownName, ...backend });
  return () => backends.delete(backend.id);
}
