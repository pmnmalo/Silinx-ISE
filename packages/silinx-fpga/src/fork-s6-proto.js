// PROTOTYPE (not to commit; Silinx #3138 does it properly): the Spartan-6's packing and placement by the fork's own
// packer (pmnmalo/nextpnr-spartan, spartan6 pack.cc, pads.cc), natively: SILINX_S6_FORK=<nextpnr-himbaechel binary>.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const forkBinary = () => (typeof process !== 'undefined' && process.env?.SILINX_S6_FORK) || null;

/** The netlist's cells by name (nextpnr's reading order), so that Silinx's Map and the fork's packer see one order. */
export function sortedNetlist(text) {
  if (!forkBinary()) return text;
  const j = JSON.parse(text);
  for (const m of Object.values(j.modules)) if (m.cells) m.cells = Object.fromEntries(Object.entries(m.cells).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return JSON.stringify(j);
}

/** Yosys's netlist for the fork: each I/O buffer with its port bit and constraints (from Silinx's phys, on the same netlist). */
export function forkInput(text, phys) {
  const j = JSON.parse(text);
  const mod = Object.values(j.modules).find(m => m.attributes?.top) ?? Object.values(j.modules)[0];
  const keys = Object.keys(mod.cells);
  for (const inst of phys.insts) {
    if (inst.kind !== 'iob') continue;
    const c = mod.cells[keys[inst.cell]], a = inst.cons || {};
    c.attributes = { ...c.attributes, PORT: inst.port, ...(inst.loc ? { LOC: inst.loc } : {}), ...(a.iostandard ? { IOSTANDARD: a.iostandard } : {}),
      ...(a.drive ? { DRIVE: String(a.drive) } : {}), ...(a.slew ? { SLEW: a.slew } : {}), ...(a.pull ? { PULL: a.pull } : {}) };
  }
  return j;
}

/** One run of the native fork: { json, lines } (throws with nextpnr's ERROR lines). */
export function runFork(args, input, db) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-fork-'));
  try {
    fs.writeFileSync(path.join(dir, 'chipdb.bin'), db);
    fs.writeFileSync(path.join(dir, 'design.json'), JSON.stringify(input));
    const r = spawnSync(forkBinary(), ['--chipdb', 'chipdb.bin', '--json', 'design.json', '--write', 'out.json', ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 256 << 20 });
    const lines = `${r.stdout}\n${r.stderr}`.split('\n');
    if (r.status !== 0) throw Object.assign(new Error(`the fork failed: ${lines.filter(l => /ERROR/.test(l)).slice(0, 3).join(' ')}`), { lines });
    return { json: JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')), lines };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
