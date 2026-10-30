// #897: which setting owns a pad bit ISE sets and the database gives to no feature of the design (or to another pad's):
// variants of one design ISE routed, each with one setting of the given pads' instances removed, or one PIP of the
// given tiles (as gen-sitedrop.mjs / gen-pipdrop.mjs do for every instance of a kind or every PIP), everything else
// unchanged; ISE's bitgen on each (fuzz-remote.sh), then ana-padbits.mjs: the bits that change with each.
//   node gen-padbits.mjs routed.xdl outdir PADS TILES      (PADS: A3,C9,D9; TILES: TIBUFS_X2Y61,TIOIS_X22Y61)
import fs from 'node:fs';

const [src, out, pads = '', tiles = ''] = process.argv.slice(2);
const want = new Set(pads.split(',').filter(Boolean)), wantTile = new Set(tiles.split(',').filter(Boolean));
fs.mkdirSync(out, { recursive: true });
const text = fs.readFileSync(src, 'utf8');
fs.writeFileSync(`${out}/BASE.xdl`, text);
const variants = [];
const INST = /(inst "(?:\\.|[^"])*" "\w+",placed \S+ (\S+)\s*,\s*cfg ")([^"]*)(")/g;
// each setting of a wanted pad's instance (the notes of the tools, _…, kept)
for (const m of text.matchAll(INST)) {
  const [, , site, cfg] = m;
  if (!want.has(site)) continue;
  for (const s of cfg.split(/\s+/).filter(Boolean)) {
    const attr = s.split(':')[0];
    if (attr.startsWith('_') || /#OFF$/.test(s)) continue;
    const name = `${site}_${attr}`.replace(/\W/g, '_');
    const t = text.replace(INST, (all, a, st, c, b) => st !== site ? all : a + c.split(/(\s+)/).filter(x => x !== s).join('') + b);
    fs.writeFileSync(`${out}/${name}.xdl`, t);
    variants.push({ name, pad: site, setting: s });
  }
}
// each PIP of a wanted tile
const PIP = /^\s*pip (\S+) (\S+) (->|=-|==|=>) (\S+) ,?\s*$/gm;
let k = 0;
for (const m of text.matchAll(PIP)) {
  if (!wantTile.has(m[1])) continue;
  const name = `P${k++}`;
  fs.writeFileSync(`${out}/${name}.xdl`, text.slice(0, m.index) + text.slice(m.index + m[0].length));
  variants.push({ name, tile: m[1], pip: `${m[2]}->${m[4]}` });
}
fs.writeFileSync(`${out}/key.json`, JSON.stringify({ src, variants }));
console.log(`${variants.length} variants (${variants.filter(v => v.pad).length} settings, ${k} PIPs)`);
