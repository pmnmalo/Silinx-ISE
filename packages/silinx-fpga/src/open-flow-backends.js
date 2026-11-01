// Silinx toolchain - the flow's back ends, one per family (#2360): what runFlow (open-flow-core.js) asks of a family, so
// that it names none. A back end is { id, mount(ctx), synth?, synthName?, constraints? }:
//   mount(ctx)   -> { runMap, runPar, runTiming, runPins, runPower, bitfile(name, startupClk), runFpgaView?, packed?,
//                   routedOrEarlier?, routedText? }: the family's steps, with its engines; ctx: runFlow's (its getters:
//                   netlist, netlistText). The routed design is the back end's (#2384): its format, its file, an earlier
//                   run's read again by the steps that need it; routedOrEarlier and routedText give it to the simulation models
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
import { mountFlowReports } from './open-flow-reports.js';
import { mountS3eSteps } from './open-flow-s3e.js';
import { mountS6Steps } from './open-flow-s6.js';
import { mountNextpnrSteps } from './open-flow-nextpnr.js';
import { mountNextpnrS6 } from './open-flow-nextpnr-s6.js';
import { synthesizeVerilog } from './synth-open.js';
import { scriptSynthesis } from './synth-script.js';

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

// nextpnr's Map and Place & Route (#2136: open-flow-nextpnr.js), chosen by spec.engine: 'nextpnr' always; 'auto' when it can
// implement the design (its cells, every port's pad), else the Silinx engine, which Map says
function mountS3e(base) {
  const routed = xdlRouted(base), ctx = { ...base, ...routed };
  const { spec, log } = ctx;
  const own = mountS3eSteps(ctx);
  const np = (spec.engine === 'nextpnr' || spec.engine === 'auto') ? mountNextpnrSteps(ctx) : null;
  let viaNextpnr = null;
  const useNextpnr = async () => {
    if (viaNextpnr !== null) return viaNextpnr;
    viaNextpnr = !!np && (spec.engine === 'nextpnr' || !np.problems().length);
    if (np && !viaNextpnr) {
      const p = np.problems();
      log(`Map: the nextpnr engine cannot implement this design yet (${p[0]}${p.length > 1 ? `, and ${p.length - 1} more` : ''}): the Silinx engine places and routes it.`);
    } else if (viaNextpnr && spec.engine === 'auto') {
      // 'auto' with nextpnr not starting (offline, its chip database not downloaded yet, #2329): the Silinx engine, warned
      try { await np.load(); } catch (e) {
        viaNextpnr = false;
        log(`WARNING:Map - the nextpnr engine could not start (${e.message}): the Silinx engine places and routes this design.`);
      }
    }
    return viaNextpnr;
  };
  return {
    runMap: async () => (await useNextpnr() ? np.runMap : own.runMap)(),
    runPar: async () => (await useNextpnr() ? np.runPar : own.runPar)(),
    packed: own.packed,
    routedOrEarlier: routed.routedOrEarlier, routedText: routed.routedText,
    ...mountFlowReports({ ...ctx, reports: S3E_REPORTS }),
  };
}

// the Spartan-6's Map and Place & Route (#732: open-flow-s6.js); by nextpnr ('nextpnr' only, #2138): Silinx's Map,
// nextpnr's Place & Route (open-flow-nextpnr-s6.js)
function mountS6(base) {
  const routed = xdlRouted(base), ctx = { ...base, ...routed };
  const own = mountS6Steps(ctx);
  const np = ctx.spec.engine === 'nextpnr' ? mountNextpnrS6({ ...ctx, state: own.state }) : null;
  return { runMap: own.runMap, runPar: () => (np || own).runPar(), routedOrEarlier: routed.routedOrEarlier, routedText: routed.routedText,
    ...mountFlowReports({ ...ctx, reports: S6_REPORTS }) };
}

// the synthesis's report: its lines as XST names them (the Spartan-3E's), else as the MAP report does (the part's resources)
const XST_NAMES = { luts: 'Number of 4 input LUTs', ffs: 'Number of Slice Flip Flops', ramb16: 'Number of RAMB16s', mult18x18: 'Number of MULT18X18SIOs', bufgmux: 'Number of GCLKs', dcm: 'Number of DCMs', iob: 'Number of IOs' };
const xstName = id => XST_NAMES[id] || id;
const mapName = (id, resource) => resource?.report || XST_NAMES[id] || id;

const SPARTAN3E = { id: 'spartan3e', mount: mountS3e, synth: synthesizeVerilog, synthName: xstName };
const OTHER = { id: 'other', mount: mountS3e, synth: synthesizeVerilog, synthName: mapName };
const backends = new Map([['spartan3e', SPARTAN3E], ['spartan6', { id: 'spartan6', mount: mountS6, synth: synthesizeVerilog, synthName: mapName }]]);
// a registered back end's synthesis and report names when it gives none: Yosys's generic synth, its resources' names
const GENERIC_SYNTH = scriptSynthesis({ script: top => `synth -flatten -top ${top}` });
const ownName = (id, resource) => resource?.report || id;

/** The back end of a family. */
export const backendOf = family => backends.get(family) || OTHER;

/** Add a family's back end (its family's id: backend.id); returns the function that takes it away. */
export function registerBackend(backend) {
  if (typeof backend?.mount !== 'function' || !backend.id) throw new Error('a back end needs an id and mount(ctx)');
  if (backends.has(backend.id)) throw new Error(`the family ${backend.id} has its back end`);
  backends.set(backend.id, { synth: GENERIC_SYNTH, synthName: ownName, ...backend });
  return () => backends.delete(backend.id);
}
