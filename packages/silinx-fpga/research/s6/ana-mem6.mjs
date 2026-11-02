// The SLICEM of each gen-mem6.mjs design as ISE wrote it (#1153): its settings (the names left out) and what each of
// its pins carries (a port, by its IOB; the clock; a constant), the reference of the XDL writer's RAMs and shift
// registers (test/s6-xdl-mem.test.js); and the entries of its LUTs ISE's bitgen set in top.bit (#2556: the contents'
// layout in each RAM mode, test/s6-check-slice.test.js).
//   node ana-mem6.mjs <dir of ise-s6.sh impl's results> > measured/mem.json
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseXdl } from '../../src/xdl.js';
import { readBit6, FRAME_WORDS } from '../../src/fpga/s6/bitstream.js';
import { loadBitDbS6 } from '../../src/fpga/s6/bitdb-node.js';

/** A design's one SLICEM: { cfg: ['ATTR::VALUE' …] (not #OFF, sorted), pins: { pin: 'port' | 'clock' | 'vcc' | 'gnd' } }. */
export function memSummary(text) {
  const x = parseXdl(text);
  const slices = x.insts.filter(i => i.type === 'SLICEM');
  if (slices.length !== 1) throw new Error(`${slices.length} SLICEMs`);
  const s = slices[0], kind = new Map(x.insts.map(i => [i.name, i.type]));
  const cfg = s.cfg.filter(c => c.value !== '#OFF' && !/^_(BEL_PROP|ROUTETHROUGH)$/.test(c.attr) && !(c.attr === '' && !c.value))
    .map(c => `${c.attr}::${c.value}`).sort();
  const pins = {};
  for (const n of x.nets) {
    const all = [...n.outpins, ...n.inpins];
    const mine = all.filter(p => p.inst === s.name);
    if (!mine.length) continue;
    const io = all.find(p => kind.get(p.inst) === 'IOB');
    const tag = n.type === 'vcc' || n.type === 'gnd' ? n.type : all.some(p => kind.get(p.inst) === 'BUFG') ? 'clock' : io ? io.inst : '?';
    for (const p of mine) pins[p.pin] = tag;
  }
  return { site: s.site, cfg, pins: Object.fromEntries(Object.entries(pins).sort()) };
}

/** The entries of a SLICEM's LUTs set in a .bit: { A … D: [entries] } (the LUTs with none left out), by the LUT map. */
export function memLutBits(bitBytes, site, lutDb) {
  const { fdri } = readBit6(bitBytes), [f0, b0] = lutDb.slices[site], out = {};
  for (const [p, offs] of Object.entries(lutDb.kinds.M)) {
    const set = offs.map(([f, b], e) => [e, fdri[(f0 + f) * FRAME_WORDS + ((b0 + b) >> 4)] & (1 << (15 - ((b0 + b) & 15)))]).filter(([, x]) => x).map(([e]) => e);
    if (set.length) out[p] = set;
  }
  return out;
}

if (process.argv[2]) {
  const dir = process.argv[2], out = {}, lutDb = loadBitDbS6('xc6slx16csg324-3').slices.lut;
  for (const d of readdirSync(dir).sort()) {
    if (!existsSync(join(dir, d, 'top.xdl'))) continue;
    const { site, ...m } = memSummary(readFileSync(join(dir, d, 'top.xdl'), 'utf8'));
    out[d] = existsSync(join(dir, d, 'top.bit')) ? { ...m, lut: memLutBits(readFileSync(join(dir, d, 'top.bit')), site, lutDb) } : m;
  }
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
}
