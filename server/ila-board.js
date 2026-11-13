// Silinx - the logic analyzer on the board, from the application's server (#3176): a capture run (core/ila-link.js
// runCapture) through the board's Digilent Adept USB with adepttool (scripts/ila-scan.py, kept open for the whole run:
// one line of scans in, one of words out), the core's spec as Implement made it (the project's capture settings on its
// design: core/ila-insert.js planInsertion), the capture saved as build/capture.json (each probe's samples by its path,
// the trigger's sample), what the interface's waveform viewer and the MCP tool read.
//
//   const link = await boardLink(spec, { cfg, device })   link.scan(words), link.close()
//   const r = await captureProject(name, { arm, timeoutMs, device, log, link })   { capture, file, spec, probes }
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import * as P from './projects.js';
import { loadConfig } from './toolchain.js';
import { adepttoolPaths } from './programmer.js';

const ILA_SCAN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ila-scan.py');
const CAPTURE_FILE = 'build/capture.json';

/** The link through adepttool (its Python and modules: cfg's paths, as the programmer's). */
export async function boardLink(spec, { cfg = null, device = 0 } = {}) {
  const { planCapture } = await import('../core/ila.js');
  const a = adepttoolPaths(cfg ?? await loadConfig());
  if (!a.ok) throw new Error('The capture reads the board through adepttool, which is not installed: run scripts/install-adepttool.sh.');
  const libdirs = ['/opt/homebrew/lib', '/usr/local/lib'];
  const env = { ...process.env, PYTHONPATH: a.src, DYLD_FALLBACK_LIBRARY_PATH: [process.env.DYLD_FALLBACK_LIBRARY_PATH, ...libdirs].filter(Boolean).join(':') };
  const child = spawn(a.py, [ILA_SCAN, '--bits', String(planCapture(spec).regBits), '--device', String(device)], { cwd: a.src, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const next = async () => {
    const { value, done } = await lines.next();
    if (done) throw new Error(`the board's scans stopped${stderr.trim() ? `: ${stderr.trim().split('\n').pop()}` : ''}`);
    const msg = JSON.parse(value);
    if (msg.error) throw new Error(msg.error);
    return msg;
  };
  try {
    const ready = await next();
    return {
      product: ready.product, fpga: ready.fpga,
      async scan(words) {
        child.stdin.write(`${JSON.stringify({ scan: words.map(w => BigInt(w).toString(16)) })}\n`);
        return (await next()).words.map(w => BigInt(`0x${w}`));
      },
      async close() {
        if (child.exitCode === null) child.stdin.end(`${JSON.stringify({ close: true })}\n`);
        await new Promise(r => (child.exitCode !== null ? r() : child.once('exit', r)));
      },
    };
  } catch (e) { child.kill(); throw e; }
}

/** The capture core's spec of a project: its capture settings on its design, as Implement inserts it. */
async function captureSpecOf(name, pj) {
  const { viewSourcesOf } = await import('./mcp-util.js');
  const { compile, elaborate } = await import('../core/compile.js');
  const { primitiveSources } = await import('../core/unisim.js');
  const { planInsertion } = await import('../core/ila-insert.js');
  const { findPart } = await import('./devices.js');
  if (!pj.capture) throw new Error(`the project '${name}' has no capture (capture_settings sets one, then Implement and program the board)`);
  if (!pj.top) throw new Error(`the project '${name}' has no top module`);
  const srcs = await viewSourcesOf(name, pj, false);
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const design = elaborate(lib, pj.top);
  const family = findPart(pj.device?.part)?.family || 'spartan3e';
  const ins = planInsertion(design, pj.capture, { family });
  if (ins.errors.length) throw new Error(`the capture no longer fits the design: ${ins.errors.join(' ')}`);
  return { spec: ins.spec, probes: ins.probes };
}

/**
 * A capture of a project's design on its board: arm (unless arm is false), wait for the trigger (timeoutMs), read it,
 * save it (build/capture.json). link: one given (the tests'), else boardLink's. Returns { capture, file, spec, probes }.
 */
export async function captureProject(name, { arm = true, timeoutMs = 10000, device = 0, log = () => {}, link = null } = {}) {
  const { runCapture, captureRecord, captureLinkError } = await import('../core/ila-link.js');
  const { captureClockText } = await import('../core/ila-insert.js');
  const pj = await P.readProject(name);
  const { spec, probes } = await captureSpecOf(name, pj);
  const own = !link;
  if (own && captureLinkError(spec.family)) throw new Error(captureLinkError(spec.family));
  link ||= await boardLink(spec, { device });
  let cap;
  try { cap = await runCapture(link, spec, { arm, timeoutMs, log }); } finally { if (own) await link.close(); }
  const capture = captureRecord({ top: pj.top, clock: captureClockText(pj.capture), spec, probes, cap });
  const file = path.join(P.projectDir(name), CAPTURE_FILE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(capture, null, 1)}\n`);
  return { capture, file: CAPTURE_FILE, spec, probes };
}
