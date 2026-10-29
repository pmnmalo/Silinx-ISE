// Stage S6-E2 (#1951): the CMT paths' PIPs one at a time in context. From designs ISE routed (gen-cmtsites6.mjs's),
// each PIP of a tile other than the INT and CLB ones whose bits the databases have not (none, or no bits: the drop of
// many PIPs at once gave the CLKC tile's, far from its region, to other tiles) dropped alone from the first design
// that has it: <design>.base.xdl once, <design>-p<i>.drop.xdl without that PIP, its .drop.json ([{ tile, pip }]).
// ise-xdl-bits.sh turns them into bitstreams; ana-cmtdrop6.mjs takes each drop's bits.
//   node research/s6/gen-cmtdrop6.mjs <out dir> <design dir> …   (each with top.xdl)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A routed XDL's PIPs of the tiles not KEPT: [{ tile, pip, line }] (line: its index in the text). */
export function xdlPips(text) {
  const out = [];
  text.split('\n').forEach((l, line) => { const m = l.match(/^\s+pip (\S+) (\S+) (->|=-|==|=>) (\S+)\s*,/); if (m && !/^(INT|INT_BRK|INT_BRAM|INT_BRAM_BRK|IOI_INT|LIOI_INT|INT_GCLK|CLEXL|CLEXM)_X\d+Y\d+$/.test(m[1])) out.push({ tile: m[1], pip: `${m[2]} ${m[3]} ${m[4]}`, line }); });
  return out;
}

/** The drops: [{ design, i, tile, pip, line }], each PIP (by tile type) not in known the first time a design has it. */
export function oneDrops(designs, known) {
  const seen = new Set(), out = [];
  for (const [design, text] of designs) {
    let i = 0;
    for (const p of xdlPips(text)) {
      const key = `${p.tile.replace(/_X\d+Y\d+$/, '')} ${p.pip}`;
      if (seen.has(key) || known(key)) continue;
      seen.add(key);
      out.push({ design, i: i++, ...p });
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, ...dirs] = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/gen-cmtdrop6.mjs <out dir> <design dir> …'); process.exit(1); }
  const read = n => { const f = new URL(`../../packages/silinx-fpga/bitdb/s6/${n}.json`, import.meta.url); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).pips : {}; };
  const db = { ...read('s6-pips-other'), ...read('s6-pips-io'), ...read('s6-pips-clock'), ...read('s6-pips-probe') };
  const designs = dirs.map(d => [path.basename(d), fs.readFileSync(path.join(d, 'top.xdl'), 'utf8')]), text = new Map(designs);
  const drops = oneDrops(designs, k => db[k]?.length > 0);
  fs.mkdirSync(out, { recursive: true });
  for (const d of new Set(drops.map(x => x.design))) fs.writeFileSync(path.join(out, `${d}.base.xdl`), text.get(d));
  for (const x of drops) {
    const lines = text.get(x.design).split('\n');
    lines.splice(x.line, 1);
    fs.writeFileSync(path.join(out, `${x.design}-p${x.i}.drop.xdl`), lines.join('\n'));
    fs.writeFileSync(path.join(out, `${x.design}-p${x.i}.drop.json`), JSON.stringify([{ tile: x.tile, pip: x.pip }]));
  }
  console.log(`${drops.length} PIPs, one per drop, from ${new Set(drops.map(x => x.design)).size} designs`);
}
