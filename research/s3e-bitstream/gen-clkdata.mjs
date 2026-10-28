// #957: the switches that take a clock into the fabric, measured on designs ISE routed: a DCM output into its tile's
// output multiplexer (DCM_<output> -> OMUXk, other than the lines to the global buffers #862 measured) and a global
// buffer's output into its clock tile's (CLKT_GCLK_MAINk -> CLKT_TO_OMUXj, CLKB's). Each switch the database does not
// know is added to the net that already drives its from-wire, as a branch that leads nowhere (bitgen programs every PIP
// of a net with pins), each output line of a tile once per design; the designs are then measured by PIP drop
// (gen-pipdrop.mjs, ana-pipdrop.mjs, pips-to-db.mjs: measure-clkdata.sh).
//   PART=xc3s250ecp132-4 node gen-clkdata.mjs outdir routed.xdl…   (outdir/a0/top.xdl, a1/…: one per round and design)
import fs from 'node:fs';
import { parseXdl, writeXdl } from '../../core/xdl.js';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { knownRouting } from '../../core/fpga/bitgen.js';
import { PART, loadDb } from './db.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dev = loadDeviceCache(PART);
const known = knownRouting(loadDb(PART)).allowPip;
const SWITCH = /^(DCM_(CLK0|CLK90|CLK180|CLK270|CLK2X|CLK2X180|CLKDV|CLKFX|CLKFX180)->OMUX\d+|CLK[TB]_GCLK_MAIN\d->CLK[TB]_TO_OMUX\d)$/;

/** The unknown switches of a tile out of a wire: [to-wire]. */
function unknownOut(tile, from) {
  const k = dev.tileIndex.get(tile);
  if (k === undefined) return [];
  const out = [];
  const tp = dev.templates[dev.tileTemplate[k]];
  for (let i = 0; i < tp.from.length; i++) {
    const [a, b] = dev.pipWires(k, i);
    if (a === from && SWITCH.test(`${a}->${b}`) && !known(tile, a, b)) out.push(b);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out, ...files] = process.argv.slice(2);
  const done = new Set();   // tile type \t switch, scheduled once
  const typeOf = tile => tile.replace(/_X\d+Y\d+$/, '');
  let n = 0, total = 0;
  for (let round = 0; round < 12; round++) {
    let gain = 0;
    for (const f of files) {
      const d = parseXdl(fs.readFileSync(f, 'utf8'));
      const used = new Set(d.nets.flatMap(net => net.pips.map(p => `${p.tile}/${p.to}`)));
      let added = 0;
      for (const net of d.nets) {
        const driven = new Set([...net.pips.map(p => `${p.tile}/${p.to}`), ...net.pips.map(p => `${p.tile}/${p.from}`)]);
        for (const key of [...driven]) {
          const [tile, from] = key.split('/');
          for (const to of unknownOut(tile, from)) {
            const s = `${typeOf(tile)}\t${from}->${to}`;
            if (done.has(s) || used.has(`${tile}/${to}`)) continue;
            net.pips.push({ tile, from, dir: '->', to });
            used.add(`${tile}/${to}`); done.add(s); added++;
          }
        }
      }
      if (!added) continue;
      fs.mkdirSync(`${out}/a${n}`, { recursive: true });
      fs.writeFileSync(`${out}/a${n}/top.xdl`, writeXdl(d));
      console.log(`a${n}: ${f.split('/').slice(-2).join('/')}, ${added} switches`);
      n++; gain += added; total += added;
    }
    if (!gain) break;
  }
  console.log(`${PART}: ${n} designs, ${total} switches`);
}
