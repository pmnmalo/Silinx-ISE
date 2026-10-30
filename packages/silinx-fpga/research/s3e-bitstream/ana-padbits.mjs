// #897: the bits each variant of gen-padbits.mjs changes in ISE's bitstream (BASE.bit against <variant>.bit), the
// setting or PIP it removed; with --bits f,b…: only those bits (each variant that clears or sets one).
//   node ana-padbits.mjs dir [--bits 46,29 354,11]
import fs from 'node:fs';
import { readBit, diffFrames } from '../../src/fpga/bitstream.js';

const [dir, ...rest] = process.argv.slice(2);
const only = rest[0] === '--bits' ? new Set(rest.slice(1)) : null;
const key = JSON.parse(fs.readFileSync(`${dir}/key.json`, 'utf8'));
const base = readBit(fs.readFileSync(`${dir}/BASE.bit`));
for (const v of key.variants) {
  const f = `${dir}/${v.name}.bit`;
  if (!fs.existsSync(f)) { console.log(`${v.name}: no .bit`); continue; }
  const d = diffFrames(base.frames, readBit(fs.readFileSync(f)).frames, base.frameWords)
    .map(x => `${x.value ? '' : '!'}${x.frame},${x.bit}`).filter(x => !only || only.has(x.replace('!', '')));
  if (only && !d.length) continue;
  console.log(`${v.name} (${v.pad ? `${v.pad} ${v.setting}` : `${v.tile} ${v.pip}`}): ${d.join(' ') || 'no change'}`);
}
