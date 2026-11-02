// The SLICEM of each gen-mem6.mjs design as ISE wrote it (#1153): its settings (the names left out) and what each of
// its pins carries (a port, by its IOB; the clock; a constant), the reference of the XDL writer's RAMs and shift
// registers (test/s6-xdl-mem.test.js).
//   node ana-mem6.mjs <dir of ise-s6.sh impl's results> > measured/mem.json
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseXdl } from '../../src/xdl.js';

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
  return { cfg, pins: Object.fromEntries(Object.entries(pins).sort()) };
}

if (process.argv[2]) {
  const dir = process.argv[2], out = {};
  for (const d of readdirSync(dir).sort()) if (existsSync(join(dir, d, 'top.xdl'))) out[d] = memSummary(readFileSync(join(dir, d, 'top.xdl'), 'utf8'));
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
}
