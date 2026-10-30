// Full project, stage B: the bits of each slice setting (variant vs BASE), as positions relative to
// the slice's LUT F (frame offset, bit offset), so they can be placed in any slice with the map.
import fs from 'node:fs';
import { readBit, diffBits } from './bits.mjs';

const dir = process.argv[2];
const LUTF = { frame: 236, bit: 736 };   // LUT F of SLICE_X31Y47 (stage 2)
const base = readBit(`${dir}/BASE.bit`), FW = base.flr + 1;
const rows = [];
for (const f of fs.readdirSync(dir).filter(f => /\.bit$/.test(f) && f !== 'BASE.bit').sort()) {
  const v = readBit(`${dir}/${f}`);
  const d = diffBits(base.fdri, v.fdri, FW).map(x => ({ df: x.frame - LUTF.frame, db: x.wordInFrame * 32 + (31 - x.bit) - LUTF.bit, to: x.to }));
  const log = fs.existsSync(`${dir}/${f.replace('.bit', '.xlog')}`) ? fs.readFileSync(`${dir}/${f.replace('.bit', '.xlog')}`, 'utf8') : '';
  const err = /ERROR[^\n]*/.exec(log)?.[0];
  rows.push({ variant: f.replace('.bit', ''), bits: d.length, where: d.map(x => `f${x.df >= 0 ? '+' : ''}${x.df}:b${x.db >= 0 ? '+' : ''}${x.db}=${x.to}`).join(' '), err });
}
const failed = fs.readdirSync(dir).filter(f => /\.xdl$/.test(f) && f !== 'BASE.xdl' && !fs.existsSync(`${dir}/${f.replace('.xdl', '.bit')}`));
for (const r of rows) console.log(`${r.variant.padEnd(22)} ${String(r.bits).padStart(2)}  ${r.where}`);
if (failed.length) {
  console.log(`\nnot accepted by ISE (${failed.length}):`);
  for (const f of failed) { const log = fs.readFileSync(`${dir}/${f.replace('.xdl', '.xlog')}`, 'utf8'); console.log(`  ${f.replace('.xdl', '')}: ${(/ERROR[^\n]*/.exec(log) || [log.trim().split('\n').pop()])[0]}`); }
}
fs.writeFileSync(`${dir}/slice-bits.json`, JSON.stringify(rows, null, 1));
