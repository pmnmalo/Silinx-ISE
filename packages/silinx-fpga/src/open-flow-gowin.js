// Silinx toolchain - the Gowin's back end (#2303), a family of open-flow-backends.js's: Yosys's synth_gowin, then
// nextpnr-himbaechel-gowin's place and route (Apicula's chip databases) into its routed netlist (open/routed.json), then
// gowin_pack's bitstream (<top>.fs): Silinx's JavaScript port of Apicula's (fpga/gowin/pack.js; the package's own is Python, which
// runs in a browser only through Pyodide); the constraints are CST (cst.js). Both come through io.nextpnr.gowin { run(args,
// files, onLine) -> files, pack(routedJson, family) -> .fs text } (nextpnr-gowin-io.js: YoWASP's @yowasp/nextpnr-himbaechel-gowin).
// nextpnr-himbaechel-gowin places no port without a pin: such a port is an error here, named, before nextpnr runs.
import { scriptSynthesis } from './synth-script.js';
import { CST } from './cst.js';
import { portBits, nextpnrNames } from './nextpnr-ports.js';

/** The Gowin's parts, packages and speeds nextpnr-himbaechel-gowin takes: `${part}/${package}${speed}` -> its --device and family. */
export const GOWIN_DEVICES = {
  'gw1nr-9c/qn88-6': { device: 'GW1NR-LV9QN88PC6/I5', family: 'GW1N-9C' },
};
/** The Gowin's parts of nextpnr's chip databases here. */
export const GOWIN_PARTS = [...new Set(Object.keys(GOWIN_DEVICES).map(k => k.split('/')[0]))];

/** The Gowin's steps, as runFlow runs them. */
export const GOWIN_STEPS = [
  { id: 'synth', label: 'Synthesize - Yosys', needs: [] },
  { id: 'translate', label: 'Translate', needs: ['synth'] },
  { id: 'par', label: 'Place & Route - nextpnr', needs: ['translate'] },
  { id: 'bitgen', label: 'Generate Programming File - gowin_pack', needs: ['par'] },
];

// the synthesis's resources, from synth_gowin's cells
const sum = (counts, re) => Object.entries(counts).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);
export const gowinUtilization = counts => ({
  luts: sum(counts, /^LUT[1-4]$/), flipFlops: sum(counts, /^DFF/), latches: sum(counts, /^DL/), ios: sum(counts, /^(I|O|T|IO)BUF$/), carry: sum(counts, /^ALU$/),
  muxes: sum(counts, /^MUX2_LUT[5-8]$/), distributedRam: sum(counts, /^RAM16S/),
  blockRam: sum(counts, /^(SP|SPX9|DP|DPX9|SDPB|SDPX9B|pROM|pROMX9)$/), multipliers: sum(counts, /^MULT/), clockBuffers: sum(counts, /^(BUFG|DQCE|DCS)$/), dcms: sum(counts, /^[rP]PLL/),
  cells: sum(counts, /./),
});
const NAMES = { luts: 'Number of LUT4s', ffs: 'Number of flip-flops', iob: 'Number of IOBs' };

const text = v => (typeof v === 'string' ? v : new TextDecoder().decode(v));
// a clock as the report names its net: clk_IBUF_I_O (the input buffer's output) -> clk
const clockName = n => n.replace(/_IBUF_I_O$/, '');

/** The device of a spec: its --device and family, or null. */
export const gowinDevice = spec => GOWIN_DEVICES[`${String(spec.device || '').toLowerCase()}/${String(spec.pkg || '').toLowerCase()}${spec.speed || '-6'}`] || null;

function mountGowin(ctx) {
  const { io, spec, log, report, top, ms, now, constraints, netlistText, StepError } = ctx;
  const tool = () => {
    if (!io.nextpnr?.gowin) throw new StepError('nextpnr-himbaechel-gowin is not in this installation (io.nextpnr.gowin)', [], 'Install it: npm install @yowasp/nextpnr-himbaechel-gowin');
    return io.nextpnr.gowin;
  };

  async function runPar() {
    const dev = gowinDevice(spec);
    if (!dev) throw new StepError(`${spec.device}-${spec.pkg}${spec.speed || ''}: not a Gowin device of nextpnr-himbaechel-gowin here (${Object.keys(GOWIN_DEVICES).join(', ')})`, [], '');
    const t = now();
    const bits = portBits(netlistText(), top);
    const read = constraints(), cst = read && nextpnrNames(read, bits);
    const pins = cst?.assignments || {};
    const free = bits.map(b => b.name).filter(p => !pins[p]?.loc);
    if (free.length) {
      throw new StepError(`${free.length} port(s) with no pin (IO_LOC in the CST): ${free.slice(0, 12).join(', ')}${free.length > 12 ? ', …' : ''}: nextpnr-himbaechel-gowin places no port without one`, [],
        'Assign them in I/O Pin Planning.');
    }
    // (a CST has no clock: nextpnr's --freq, the fastest of the constraints' clocks)
    const mhz = Math.max(0, ...(cst?.clocks || []).map(c => 1000 / c.period));
    const args = ['--device', dev.device, '--vopt', `family=${dev.family}`, '--vopt', 'cst=design.cst', '--json', 'netlist.json', '--write', 'routed.json',
      '--report', 'report.json', '--seed', String(spec.seed || 1), ...(mhz ? ['--freq', String(+mhz.toFixed(6))] : [])];
    const nextpnr = tool(), lines = [];
    let out;
    try {
      out = await nextpnr.run(args, { 'netlist.json': netlistText(), 'design.cst': CST.write(cst) }, l => lines.push(l));
    } catch (e) {
      throw new StepError(`nextpnr-himbaechel-gowin failed: ${e.message}`, lines.filter(l => /^ERROR:/.test(l)), '');
    }
    for (const l of lines.filter(l => /^Warning:/.test(l))) log(`WARNING:Place - ${l.replace(/^Warning:\s*/, '')}`);
    const r = JSON.parse(text(out['report.json']));
    report.files.routed = io.write('open/routed.json', text(out['routed.json']));
    const items = Object.entries(r.utilization || {}).filter(([, u]) => u.used).map(([name, u]) => ctx.util(name, u.used, u.available));
    report.map = { utilization: items, warnings: 0, errors: 0 };
    log('Device utilization (nextpnr-himbaechel-gowin):');
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
    const fmax = Object.entries(r.fmax || {}).map(([clock, f]) => ({ clock: clockName(clock), achieved: +f.achieved.toFixed(2), constraint: +f.constraint.toFixed(2) }));
    for (const f of fmax) log(`Clock ${f.clock}: ${f.achieved} MHz (${f.achieved >= f.constraint ? 'met' : 'NOT met'}, ${f.constraint} MHz asked)`);
    report.par = { routed: true, unroutedSignals: 0, done: true, engine: 'nextpnr', fmax, constraintsMet: fmax.every(f => f.achieved >= f.constraint) };
    routed = text(out['routed.json']);
    log(`Placed and routed by nextpnr-himbaechel-gowin in ${ms(t)}: ${report.files.routed}`);
  }

  // gowin_pack (Silinx's port) on the routed design, this run's or an earlier one's
  async function runBitgen() {
    const dev = gowinDevice(spec);
    if (!dev) throw new StepError(`${spec.device}-${spec.pkg}${spec.speed || ''}: not a Gowin device of nextpnr-himbaechel-gowin here (${Object.keys(GOWIN_DEVICES).join(', ')})`, [], '');
    if (routed == null) routed = io.read('open/routed.json');
    if (routed == null) throw new StepError('no routed design: run Place & Route first', [], '');
    const t = now();
    let fs;
    try { fs = await tool().pack(routed, dev.family); } catch (e) { throw new StepError(`gowin_pack failed: ${e.message}`, [], ''); }
    const bytes = new TextEncoder().encode(fs);
    report.bit = { path: io.write(`${top}.fs`, bytes), size: bytes.length };
    log(`Bitstream: build/${top}.fs (${bytes.length} bytes, gowin_pack in ${ms(t)})`);
  }

  let routed = null;
  return { steps: { translate: ctx.readNetlist, par: runPar, bitgen: runBitgen } };
}

export const GOWIN = {
  id: 'gowin', mount: mountGowin, steps: GOWIN_STEPS, constraints: CST,
  synth: scriptSynthesis({ script: top => `synth_gowin -top ${top}`, utilization: gowinUtilization }),
  synthName: (id, resource) => resource?.report || NAMES[id] || id,
};
