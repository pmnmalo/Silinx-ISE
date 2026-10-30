// Settings of the sites other than slices (IOB, DCM, BUFGMUX…) measured in a design routed by ISE, as
// gen-attrdrop.mjs does for slices: each variant removes one setting from every instance of a site
// kind that has it (IOB0, IOB1, IOB2 of the I/O tiles separately), everything else unchanged, so the
// bits of that setting change near every such instance (ana-sitedrop.mjs). A setting that names an
// element (IFF1:name:#FF) is removed with its name.
//   PART=… node gen-sitedrop.mjs routed.xdl outdir [TYPE,…]      (default IOB,IBUF,DCM,BUFGMUX)
// The I/O settings already in the database (standard, drive, slew, the buffers and the plain input
// and output paths) are left alone (SKIP).
import fs from 'node:fs';
import { parseXdl } from '../../src/xdl.js';
import { siteKind } from '../../src/fpga/bitgen.js';
import { loadDb } from './db.mjs';

const [src, out, types = 'IOB,IBUF,DCM,BUFGMUX'] = process.argv.slice(2);
const want = new Set(types.split(','));
const db = loadDb();
fs.mkdirSync(out, { recursive: true });
const text = fs.readFileSync(src, 'utf8');
fs.writeFileSync(`${out}/BASE.xdl`, text);
const design = parseXdl(text);
// the kind of every instance of the wanted types: IOB<k> (k from the pads of the device), DCM, BUFGMUX_…
const kindOf = new Map();
for (const i of design.insts) if (i.placed && want.has(i.type)) kindOf.set(i.name, siteKind(i, db) || i.type);
// the (kind, attribute) pairs used, and the settings that are not notes of the tools
const pairs = new Map();
for (const i of design.insts) {
  const k = kindOf.get(i.name);
  if (!k) continue;
  for (const c of i.cfg) {
    if (c.value === '#OFF' || c.attr.startsWith('_')) continue;
    const key = `${/^BUFGMUX_/.test(k) ? 'BUFGMUX' : k}:${c.attr}`;
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }
}
const SKIP = /^IOB\d:(IOATTRBOX|PAD|INBUF|OUTBUF|DRIVEATTRBOX|SLEW|PULL|IDELMUX|IMUX|O1INV|OMUX)$/;
const variants = [];
for (const [key] of pairs) {
  if (SKIP.test(key)) continue;
  const [kind, attr] = key.split(':');
  let count = 0;
  const t = text.replace(/(inst "([^"]*)" "(\w+)",placed \S+ \S+\s*,\s*cfg ")([^"]*)(")/g, (m, a, name, type, cfg, b) => {
    const k = kindOf.get(name.replace(/\\(.)/g, '$1'));
    if (!k || (kind === 'BUFGMUX' ? !/^BUFGMUX_/.test(k) : k !== kind)) return m;
    const re = new RegExp(`(^|\\s)${attr}:(?:\\\\.|[^\\s])*`, 'g');
    const c2 = cfg.replace(re, (s, sp) => (/#OFF$/.test(s) ? s : (count++, sp)));
    return a + c2 + b;
  });
  if (!count) continue;
  const name = `${kind}_${attr}`.replace(/\W/g, '_');
  fs.writeFileSync(`${out}/${name}.xdl`, t);
  variants.push({ name, kind, attr, count });
}
fs.writeFileSync(`${out}/key.json`, JSON.stringify({ src, variants }));
console.log(`${variants.length} variants (${[...new Set(variants.map(v => v.kind))].join(', ')})`);
