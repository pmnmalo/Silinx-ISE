// Stage S6-E (#727): the I/O pads' settings. Designs in XDL with every bonded pad of the package an IOB of the same
// settings (no nets): the base (an output, LVCMOS25, drive 12, slew SLOW, as Silinx writes it, packages/silinx-fpga/src/fpga/s6/xdl.js
// iobCfg), an input, a bidirectional one, the id designs (the base, and the input as inid, on the pads whose index
// has bit j set: which pad each bit is), and one design per variant (a drive, a slew, an output or input standard,
// a pull, the tristate; drive 24 is not LVCMOS25's in every bank: bitgen refuses it).
// ise-xdl-bits.sh turns them into bitstreams; ana-iob6.mjs reads them.
//   node research/s6/gen-iob6.mjs <out dir> [part]      (default the XC6SLX16; <part>.iob-<name>.xdl, <part>.pads.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { s6Device } from '../../test/s6-lib.mjs';

/** The bonded pads of a part, by name: [{ pad, tile }]. */
export function bondedPads(device) {
  return device.sites().filter(s => /^IOB[MS]?$/.test(s.type) && s.bonded === 1).map(s => ({ pad: s.name, tile: s.tileName })).sort((a, b) => (a.pad < b.pad ? -1 : 1));
}

/** An IOB's settings: { dir: out | in | inout, std, drive, slew, pull, tri } -> XDL cfg (iobCfg's). */
export function iobSettings({ dir = 'out', std = 'LVCMOS25', istd = std, drive = 12, slew = 'SLOW', pull = null, tri = false }, name) {
  const inb = dir !== 'out', outb = dir !== 'in', c = [];
  if (inb) c.push('BYPASS_MUX::I', `IMUX:${name}.IMUX:I`);
  if (outb) c.push(`DRIVEATTRBOX::${drive}`, 'OUSED::0');
  if (pull) c.push(`PULLTYPE::${pull}`);
  if (outb) c.push(`SLEW::${slew}`, 'SUSPEND::3STATE');
  if (tri || dir === 'inout') c.push('TUSED::0');
  if (inb) c.push(`INBUF:${name}_IBUF:`);
  if (outb) c.push(`OUTBUF:${name}_OBUF:`);
  c.push(`PAD:${name}:`);
  if (inb) c.push(`ISTANDARD::${istd}`);
  if (outb) c.push(`OSTANDARD::${std}`);
  return c.join(' ');
}

/** The round's designs: { name: settings, or null for the id designs (the base on a subset) }. */
export function iobVariants(pads) {
  const v = { base: {}, in: { dir: 'in' }, inout: { dir: 'inout' }, tri: { tri: true } };
  for (const d of [2, 4, 6, 8, 16]) v[`drive${d}`] = { drive: d };
  for (const s of ['FAST', 'QUIETIO']) v[`slew${s}`] = { slew: s };
  for (const s of ['LVCMOS33', 'LVTTL', 'LVCMOS18']) v[`out${s}`] = { std: s };
  for (const s of ['LVCMOS15', 'LVCMOS12']) v[`out${s}`] = { std: s, drive: 6 };
  for (const s of ['LVCMOS33', 'LVTTL', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12']) v[`in${s}`] = { dir: 'in', istd: s };
  for (const p of ['PULLUP', 'PULLDOWN', 'KEEPER']) v[`in${p}`] = { dir: 'in', pull: p };
  const bits = Math.ceil(Math.log2(pads.length));
  for (let j = 0; j < bits; j++) { v[`id${j}`] = { id: j }; v[`inid${j}`] = { id: j, dir: 'in' }; }
  return v;
}

/** A design's XDL: the pads (all, or for an id design those whose index has bit j) with the settings. */
export function iobDesign(part, pads, settings) {
  const out = [`design "iob" ${part} v3.2 ,\n  cfg "";\n`];
  pads.forEach((p, i) => {
    if (settings.id !== undefined && !((i >> settings.id) & 1)) return;
    const name = `p_${p.pad}`;
    out.push(`inst "${name}" "IOB",placed ${p.tile} ${p.pad}  ,\n  cfg " ${iobSettings(settings, name)} " ;\n`);
  });
  return out.join('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/gen-iob6.mjs <out dir> [part]'); process.exit(1); }
  const { device } = s6Device(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), pads = bondedPads(device);
  fs.mkdirSync(out, { recursive: true });
  const vs = iobVariants(pads);
  for (const [name, s] of Object.entries(vs)) fs.writeFileSync(path.join(out, `${p}.iob-${name}.xdl`), iobDesign(part, pads, s));
  fs.writeFileSync(path.join(out, `${p}.pads.json`), JSON.stringify(pads));
  console.log(`${part}: ${pads.length} pads, ${Object.keys(vs).length} designs`);
}
