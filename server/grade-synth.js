// Automatic grading (#3192): a synthesis test's numbers from the Silinx toolchain, in memory (core/flow-ide.js
// runOpenFlow, Yosys compiled to WebAssembly; Map, nextpnr's, for the slices): { errors, warnings, latches, luts, ffs,
// slices }, its spec and numbers core/grade-synth.js's (the page's as well, #3216). It runs in the submission's process
// (server/grade-run.js), within its limits; the device's status (its routing graph's path) is given by the grader
// (server/grade.js synthesisStatus), which may look in the user's folders.
import { runOpenFlow } from '../core/flow-ide.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yosysNode, nextpnrNode, loadDeviceCache, chipdbCacheDir } from '../packages/silinx-fpga/src/node.js';
import { resourcesOf } from '../packages/silinx-fpga/src/parts.js';
import { findPart } from './devices.js';
import { GRADE_DEVICE, synthesisSpec, synthesisNumbers } from '../core/grade-synth.js';

export { GRADE_DEVICE };

const NEXTPNR = '@silinx/nextpnr-himbaechel-spartan3e';

/**
 * nextpnr's chip database of a device, for the slices' Place & Route (#3215), got by the grader before the grading
 * process runs: the release zip leaves the databases out (#2329) and the process may neither download nor keep one, so
 * it is downloaded here (once, checked, kept: Place & Route's own fetch) and the process reads it from its folder.
 * { chipdbDir } (null when the installation has it), or { slicesReason } when it cannot be had (offline): the slices are
 * then not checked, said so. nextpnr: io.nextpnr.spartan3e (a test's stand-in).
 */
export async function slicesChipdb(device, { nextpnr = nextpnrNode() } = {}) {
  const dev = String(device.part).toLowerCase();
  try {
    await nextpnr.chipdb(`${dev}${String(device.package).toLowerCase()}`, () => {});
  } catch (e) {
    const why = /\(([^()]*)\): connect/.exec(e.message)?.[1] || e.message;
    return { chipdbDir: null, slicesReason: `the slices are not checked here: nextpnr's chip database of ${dev} is not in this installation and could not be downloaded (${why})` };
  }
  let dir = null;
  try {
    const f = fileURLToPath(import.meta.resolve(NEXTPNR)), at = path.join('node_modules', ...NEXTPNR.split('/'));
    const pkg = f.slice(0, f.lastIndexOf(at) + at.length);
    dir = chipdbCacheDir(NEXTPNR, JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version);
    if (!fs.existsSync(path.join(pkg, 'chipdb', 'fetch.json')) || !fs.existsSync(dir)) dir = null;
  } catch { dir = null; }
  return { chipdbDir: dir };
}

export async function synthesize(sources, top, test, { device = GRADE_DEVICE, status = null } = {}) {
  status ||= (await import('./open-flow.js')).openStatus(device);
  if (!status.part) return { errors: [`the Silinx toolchain cannot synthesize for ${device.part}: ${status.reason}`] };
  const lines = [], store = {};
  let dev = null;
  const io = {
    log: l => lines.push(l), sources: () => sources.map(s => ({ path: s.path, lang: s.lang, text: s.text })), ucf: null, yosys: yosysNode,
    nextpnr: { spartan3e: nextpnrNode() }, device: () => (dev ||= loadDeviceCache(status.graph)),
    write: (name, data) => { store[name] = data; return `build/${name}`; }, read: name => (typeof store[name] === 'string' ? store[name] : null), save: () => {},
  };
  const part = findPart(device.part);
  const r = await runOpenFlow(synthesisSpec(top, test, device, status, part && resourcesOf(part, device.package)), io);
  return synthesisNumbers(r, lines, test, status);
}
