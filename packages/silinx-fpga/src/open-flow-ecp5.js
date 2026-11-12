// Silinx toolchain - the ECP5's back end (#2302), a family of open-flow-backends.js's: Yosys's synth_ecp5, nextpnr-ecp5's
// place and route into Project Trellis's text configuration (open/routed.config), ecppack's bitstream (<top>.bit, Lattice's:
// no Xilinx header); the constraints are LPF (lpf.js). nextpnr and ecppack come through io.nextpnr.ecp5 { run(args, files,
// onLine) -> files, pack(config) -> bytes } (nextpnr-ecp5-io.js: YoWASP's package, @yowasp/nextpnr-ecp5).
import { scriptSynthesis } from './synth-script.js';
import { LPF } from './lpf.js';
import { portBits, nextpnrNames } from './nextpnr-ports.js';
import { mountNextpnrTiming } from './nextpnr-timing.js';
import { askedClocks } from './open-flow-ice40.js';

/** The ECP5's parts as nextpnr-ecp5 names them (its --<part> option), by Lattice's names: lfe5u-85f -> 85k, lfe5um5g-45f -> um5g-45k. */
export const ECP5_PARTS = { 'lfe5u-12f': '12k', 'lfe5u-25f': '25k', 'lfe5u-45f': '45k', 'lfe5u-85f': '85k',
  'lfe5um-25f': 'um-25k', 'lfe5um-45f': 'um-45k', 'lfe5um-85f': 'um-85k', 'lfe5um5g-25f': 'um5g-25k', 'lfe5um5g-45f': 'um5g-45k', 'lfe5um5g-85f': 'um5g-85k' };

/** The ECP5's steps, as runFlow runs them (open-steps.js XILINX_STEPS' shape). */
export const ECP5_STEPS = [
  { id: 'synth', label: 'Synthesize - Yosys', needs: [] },
  { id: 'translate', label: 'Translate', needs: ['synth'] },
  { id: 'par', label: 'Place & Route - nextpnr', needs: ['translate'] },
  { id: 'trce', label: 'Generate Post-Place & Route Static Timing', needs: ['par'] },
  { id: 'bitgen', label: 'Generate Programming File - ecppack', needs: ['par'] },
];

// the synthesis's resources, from synth_ecp5's cells (it leaves the I/O buffers to nextpnr: none counted)
const sum = (counts, re) => Object.entries(counts).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);
export const ecp5Utilization = counts => ({
  luts: sum(counts, /^LUT4$/), flipFlops: sum(counts, /^TRELLIS_FF$/), latches: 0, ios: sum(counts, /^TRELLIS_IO$/), carry: sum(counts, /^CCU2C$/),
  muxes: sum(counts, /^(PFUMX|L6MUX21)$/), distributedRam: sum(counts, /^TRELLIS_DPR16X4$/),
  blockRam: sum(counts, /^(DP16KD|PDPW16KD)$/), multipliers: sum(counts, /^MULT18X18D$/), clockBuffers: sum(counts, /^DCCA$/), dcms: sum(counts, /^EHXPLLL$/),
  cells: sum(counts, /./),
});
const NAMES = { luts: 'Number of LUT4s', ffs: 'Number of flip-flops', iob: 'Number of IOs' };

const text = v => (typeof v === 'string' ? v : new TextDecoder().decode(v));
// a clock as the report names its net: $glbnet$clk$TRELLIS_IO_IN (a global net from an input) -> clk
const clockName = n => n.replace(/^\$glbnet\$/, '').replace(/\$TRELLIS_IO_IN$/, '');

/** nextpnr-ecp5's speed grade of a device: its speed ('-6') or 6. */
const speedOf = spec => String(spec.speed || '').replace(/^-/, '') || '6';

function mountEcp5(ctx) {
  const { io, spec, log, report, top, ms, now, constraints, netlistText, StepError } = ctx;
  const device = String(spec.device || '').toLowerCase();
  const timing = mountNextpnrTiming(ctx, { tool: 'nextpnr-ecp5', clockName });
  let config = null;
  const configOrEarlier = () => {
    if (config == null) config = io.read('open/routed.config');
    if (config == null) throw new StepError('no routed design: run Place & Route first', [], '');
    return config;
  };
  const tool = () => {
    if (!io.nextpnr?.ecp5) throw new StepError('nextpnr-ecp5 is not in this installation (io.nextpnr.ecp5)', [], 'Install it: npm install @yowasp/nextpnr-ecp5');
    return io.nextpnr.ecp5;
  };

  async function runPar() {
    if (!ECP5_PARTS[device]) throw new StepError(`${spec.device}: not an ECP5 part of nextpnr-ecp5 (${Object.keys(ECP5_PARTS).join(', ')})`, [], '');
    const t = now();
    const bits = portBits(netlistText(), top);
    const read = constraints(), lpf = read && nextpnrNames(read, bits);
    const pins = lpf?.assignments || {};
    const free = bits.map(b => b.name).filter(p => !pins[p]?.loc);
    for (const p of free) log(`WARNING:Place - the port ${p} has no pin (LOCATE in the LPF): nextpnr places it anywhere.`);
    const args = [`--${ECP5_PARTS[device]}`, ...(spec.pkg ? ['--package', String(spec.pkg).toUpperCase()] : []), '--speed', speedOf(spec),
      '--json', 'netlist.json', '--textcfg', 'routed.config', '--report', 'report.json', '--seed', String(spec.seed || 1), '--timing-allow-fail',
      ...(lpf ? ['--lpf', 'design.lpf'] : []), ...(free.length ? ['--lpf-allow-unconstrained'] : [])];
    const nextpnr = tool(), lines = [];
    let out;
    try {
      out = await nextpnr.run(args, { 'netlist.json': netlistText(), ...(lpf && { 'design.lpf': LPF.write(lpf) }) }, l => lines.push(l));
    } catch (e) {
      throw new StepError(`nextpnr-ecp5 failed: ${e.message}`, lines.filter(l => /^ERROR:/.test(l)), '');
    }
    for (const l of lines.filter(l => /^Warning:/.test(l))) log(`WARNING:Place - ${l.replace(/^Warning:\s*/, '')}`);
    const r = JSON.parse(text(out['report.json']));
    config = text(out['routed.config']);
    report.files.routed = io.write('open/routed.config', config);
    const items = Object.entries(r.utilization || {}).filter(([, u]) => u.used).map(([name, u]) => ctx.util(name, u.used, u.available));
    report.map = { utilization: items, warnings: 0, errors: 0 };
    log('Device utilization (nextpnr-ecp5):');
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
    const fmax = Object.entries(r.fmax || {}).map(([clock, f]) => ({ clock: clockName(clock), achieved: +f.achieved.toFixed(2), constraint: +f.constraint.toFixed(2) }));
    for (const f of fmax) log(`Clock ${f.clock}: ${f.achieved} MHz (${f.achieved >= f.constraint ? 'met' : 'NOT met'}, ${f.constraint} MHz asked)`);
    report.par = { routed: true, unroutedSignals: 0, done: true, engine: 'nextpnr', fmax, constraintsMet: fmax.every(f => f.achieved >= f.constraint) };
    timing.record(r, askedClocks(fmax, (read?.clocks || []).map(c => c.net)));
    log(`Placed and routed by nextpnr-ecp5 in ${ms(t)}: ${report.files.routed}`);
  }

  async function runBitgen() {
    const bytes = await tool().pack(configOrEarlier());
    report.bit = { path: io.write(`${top}.bit`, bytes), size: bytes.length };
    log(`Bitstream: build/${top}.bit (${bytes.length} bytes, ecppack)`);
  }

  return { steps: { translate: ctx.readNetlist, par: runPar, trce: timing.runTiming, bitgen: runBitgen } };
}

export const ECP5 = {
  id: 'ecp5', mount: mountEcp5, steps: ECP5_STEPS, constraints: LPF,
  synth: scriptSynthesis({ script: top => `synth_ecp5 -top ${top}`, utilization: ecp5Utilization }),
  synthName: (id, resource) => resource?.report || NAMES[id] || id,
};
