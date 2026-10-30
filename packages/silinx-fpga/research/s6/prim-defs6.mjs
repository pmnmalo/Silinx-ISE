// The settings of the Spartan-6 sites, from the primitive definitions at the end of an XDLRC (xdl -report): per
// primitive, its elements with their options (cfg) and whether each is a BEL. The bit databases' designs (#725 …
// #728) set them one at a time.
//   node research/s6/prim-defs6.mjs <xdlrc[.gz]> [out.json]   (default research/s6/measured/prim-defs.json)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

/**
 * The primitive definitions of an XDLRC's text: { primitive: { element: { bel, cfg: [options] } } }; the elements
 * with neither options nor a BEL (a pin, a route-through) are left out.
 */
export function primitiveDefs(text) {
  const out = {};
  let prim = null, elem = null;
  for (const line of text.split('\n')) {
    const l = line.trim();
    let m;
    if ((m = l.match(/^\(primitive_def (\S+) /))) { prim = out[m[1]] = {}; elem = null; } else if (!prim) continue;
    else if ((m = l.match(/^\(element (\S+) \d+( # BEL)?/))) {
      elem = m[1].startsWith('_') ? null : { bel: !!m[2], cfg: [] };
      if (elem) prim[m[1]] = elem;
    } else if ((m = l.match(/^\(cfg (.*)\)$/)) && elem) elem.cfg.push(...m[1].split(/\s+/));
  }
  for (const p of Object.values(out)) for (const [k, e] of Object.entries(p)) if (!e.bel && !e.cfg.length) delete p[k];
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, out = new URL('./measured/prim-defs.json', import.meta.url)] = process.argv.slice(2);
  if (!file) { console.error('usage: node research/s6/prim-defs6.mjs <xdlrc[.gz]> [out.json]'); process.exit(1); }
  let buf = fs.readFileSync(file);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  // only the definitions as a string (the XC6SLX45's XDLRC is longer than a string can be)
  const at = buf.lastIndexOf('(primitive_defs');
  const defs = primitiveDefs(buf.subarray(Math.max(at, 0)).toString('latin1'));
  fs.writeFileSync(out, `${JSON.stringify(defs, null, 1)}\n`);
  console.log(`${Object.keys(defs).length} primitives, ${Object.values(defs).reduce((n, p) => n + Object.keys(p).length, 0)} elements`);
}
