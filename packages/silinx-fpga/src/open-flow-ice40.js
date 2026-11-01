// Silinx toolchain - the iCE40's back end (#2295), a family of open-flow-backends.js's: Yosys's synth_ice40, nextpnr-ice40's
// place and route into the IceStorm text bitstream (open/routed.asc), icepack's bitstream (<top>.bin); the constraints are
// PCF (pcf.js). nextpnr and icepack come through io.nextpnr.ice40 { run(args, files, onLine) -> files, pack(asc) -> bytes }
// (nextpnr-ice40-io.js: YoWASP's package, @yowasp/nextpnr-ice40).
import { scriptSynthesis } from './synth-script.js';
import { PCF } from './pcf.js';

/** The iCE40's parts, as nextpnr-ice40 names them (its --<part> option): ice40up5k, ice40hx8k… */
export const ICE40_PARTS = ['lp384', 'lp1k', 'lp4k', 'lp8k', 'hx1k', 'hx4k', 'hx8k', 'up3k', 'up5k', 'u1k', 'u2k', 'u4k'];

/** The iCE40's steps, as runFlow runs them (open-steps.js XILINX_STEPS' shape). */
export const ICE40_STEPS = [
  { id: 'synth', label: 'Synthesize - Yosys', needs: [] },
  { id: 'translate', label: 'Translate', needs: ['synth'] },
  { id: 'par', label: 'Place & Route - nextpnr', needs: ['translate'] },
  { id: 'bitgen', label: 'Generate Programming File - icepack', needs: ['par'] },
];

// the synthesis's resources, from synth_ice40's cells
const sum = (counts, re) => Object.entries(counts).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);
export const ice40Utilization = counts => ({
  luts: sum(counts, /^SB_LUT4$/), flipFlops: sum(counts, /^SB_DFF/), latches: 0, ios: sum(counts, /^SB_IO/), carry: sum(counts, /^SB_CARRY$/),
  blockRam: sum(counts, /^SB_RAM40_4K/), multipliers: sum(counts, /^SB_MAC16$/), clockBuffers: sum(counts, /^SB_GB/), dcms: sum(counts, /^SB_PLL40/),
  cells: sum(counts, /./),
});
const NAMES = { luts: 'Number of LUT4s', ffs: 'Number of flip-flops', ramb16: 'Number of RAM4Ks', mult18x18: 'Number of DSPs', bufgmux: 'Number of global buffers', dcm: 'Number of PLLs', iob: 'Number of IOs' };

const text = v => (typeof v === 'string' ? v : new TextDecoder().decode(v));

// a port's bits as nextpnr names them: q[0], q[1]… (a bus), clk (a bit)
function portBits(netlistText, top) {
  const mods = JSON.parse(netlistText).modules || {};
  const mod = mods[top] || Object.values(mods).find(m => m.attributes?.top) || {};
  return Object.entries(mod.ports || {}).flatMap(([name, p]) => (p.bits.length > 1 ? p.bits.map((_, i) => `${name}[${(p.offset || 0) + i}]`) : [name]));
}

function mountIce40(ctx) {
  const { io, spec, log, report, top, ms, now, constraints, netlistText, StepError } = ctx;
  const part = String(spec.device || '').toLowerCase().replace(/^ice40/, '');
  let asc = null;
  const ascOrEarlier = () => {
    if (asc == null) asc = io.read('open/routed.asc');
    if (asc == null) throw new StepError('no routed design: run Place & Route first', [], '');
    return asc;
  };
  const tool = () => {
    if (!io.nextpnr?.ice40) throw new StepError('nextpnr-ice40 is not in this installation (io.nextpnr.ice40)', [], 'Install it: npm install @yowasp/nextpnr-ice40');
    return io.nextpnr.ice40;
  };

  async function runPar() {
    if (!ICE40_PARTS.includes(part)) throw new StepError(`${spec.device}: not an iCE40 part of nextpnr-ice40 (ice40${ICE40_PARTS.join(', ice40')})`, [], '');
    const t = now();
    const pcf = constraints();
    const pins = pcf?.assignments || {};
    const free = portBits(netlistText(), top).filter(p => !pins[p]?.loc);
    for (const p of free) log(`WARNING:Place - the port ${p} has no pin (set_io in the PCF): nextpnr places it anywhere.`);
    const args = [`--${part}`, ...(spec.pkg ? ['--package', spec.pkg] : []), '--json', 'netlist.json', '--asc', 'routed.asc', '--report', 'report.json',
      '--seed', String(spec.seed || 1), ...(pcf ? ['--pcf', 'design.pcf'] : []), ...(free.length ? ['--pcf-allow-unconstrained'] : [])];
    const nextpnr = tool(), lines = [];
    let out;
    try {
      out = await nextpnr.run(args, { 'netlist.json': netlistText(), ...(pcf && { 'design.pcf': PCF.write(pcf) }) }, l => lines.push(l));
    } catch (e) {
      throw new StepError(`nextpnr-ice40 failed: ${e.message}`, lines.filter(l => /^ERROR:/.test(l)), '');
    }
    for (const l of lines.filter(l => /^Warning:/.test(l))) log(`WARNING:Place - ${l.replace(/^Warning:\s*/, '')}`);
    const r = JSON.parse(text(out['report.json']));
    asc = text(out['routed.asc']);
    report.files.routed = io.write('open/routed.asc', asc);
    const items = Object.entries(r.utilization || {}).filter(([, u]) => u.used).map(([name, u]) => ctx.util(name, u.used, u.available));
    report.map = { utilization: items, warnings: 0, errors: 0 };
    log('Device utilization (nextpnr-ice40):');
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
    const fmax = Object.entries(r.fmax || {}).map(([clock, f]) => ({ clock, achieved: +f.achieved.toFixed(2), constraint: +f.constraint.toFixed(2) }));
    for (const f of fmax) log(`Clock ${f.clock}: ${f.achieved} MHz (${f.achieved >= f.constraint ? 'met' : 'NOT met'}, ${f.constraint} MHz asked)`);
    report.par = { routed: true, unroutedSignals: 0, done: true, engine: 'nextpnr', fmax, constraintsMet: fmax.every(f => f.achieved >= f.constraint) };
    log(`Placed and routed by nextpnr-ice40 in ${ms(t)}: ${report.files.routed}`);
  }

  async function runBitgen() {
    const bytes = await tool().pack(ascOrEarlier());
    report.bit = { path: io.write(`${top}.bin`, bytes), size: bytes.length };
    log(`Bitstream: build/${top}.bin (${bytes.length} bytes, icepack)`);
  }

  return { steps: { translate: ctx.readNetlist, par: runPar, bitgen: runBitgen } };
}

export const ICE40 = {
  id: 'ice40', mount: mountIce40, steps: ICE40_STEPS, constraints: PCF,
  synth: scriptSynthesis({ script: top => `synth_ice40 -top ${top}`, utilization: ice40Utilization }),
  synthName: (id, resource) => resource?.report || NAMES[id] || id,
};
