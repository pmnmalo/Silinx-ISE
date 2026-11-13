// The example projects (examples/*): their sources, and the UCF Silinx's board pin assignment writes
// for them on a board (what the New Project wizard and Update Constraints do), for every device the
// examples run on.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { boardAutoAssign } from '../packages/silinx-fpga/src/ucf.js';
import { boardConstraintsText } from '../packages/silinx-fpga/src/board-constraints.js';
import { constraintsExtOf } from '../packages/silinx-fpga/src/family.js';
import { resolveBoard } from '../server/devices.js';
import { EXAMPLE_ORDER } from '../core/examples.js';
import { isCSource, viewHdl } from '../core/view-hdl.js';
import { topForBoard } from '../core/board-generics.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EXAMPLES = EXAMPLE_ORDER;   // gates, traffic, blinky, pong, stopwatch, clock, vga, isqrt, uart, micro80
// the examples of the ISE records made before isqrt (#1966): the Spartan-6's night 1 (packages/silinx-fpga/research/s6/
// measured), XPower's fit (test/fixtures/power); isqrt, uart (#2537) and micro80 (#2544) are checked against ISE in test/ise/examples.test.js
export const ISE_RECORDED = EXAMPLES.filter(n => n !== 'isqrt' && n !== 'uart' && n !== 'micro80');
// the boards (and variants) of the devices of the Silinx toolchain: the examples run on all of them; the Spartan-3E's
// also through ISE (test/ise/examples.test.js, the power estimates), the Spartan-6's (#732, no variants; the Atlys's
// seven-segment display and VGA on its VHDCI connector) checked against ISE in packages/silinx-fpga/research/s6 so far
export const S3E_TARGETS = [
  { board: 'basys2', variant: '100' }, { board: 'basys2', variant: '250' },
  { board: 'nexys2', variant: '500' }, { board: 'nexys2', variant: '1200' },
];
export const S6_TARGETS = [{ board: 'nexys3' }, { board: 'atlys' }];
export const TARGETS = [...S3E_TARGETS, ...S6_TARGETS];
// the examples the Spartan-6 builds: all of them since micro80's (its ALU's carry chain, #2638; the post-synthesis model of
// its distributed RAM, #2639; the bitstream of its two block RAMs, #2679)
export const S6_EXAMPLES = EXAMPLES;
export const targetsOf = name => (S6_EXAMPLES.includes(name) ? TARGETS : S3E_TARGETS);
// the iCE40's board (#2517): the examples on the iCEBreaker, the display and the switches on its Pmods; vga on its
// PmodVGA, a board of its own (icebreaker-vga). Its ports with no pin on the board, warned (btn<3>, led<5..7>…)
export const ICE40_TARGETS = [{ board: 'icebreaker' }];
// the ECP5's board (#2302): the examples on the ULX3S (its 85F), the display on its GPIO header; vga on its header too, a
// board of its own (ulx3s-vga). Its ports with no pin on the board, warned (sw<4..7>)
export const ECP5_TARGETS = [{ board: 'ulx3s' }];
// the Gowin's board (#2303): the examples on the Tang Nano 9K, every port on a pin of its headers (nextpnr-himbaechel-gowin places
// none without one); vga on the tangnano9k-vga; to its .fs through gowin_pack (Silinx's port)
export const GOWIN_TARGETS = [{ board: 'tangnano9k' }];
// the 7-series' boards (#3142): an experimental family, its constraints XDC; every example built by the Silinx toolchain
// (test/open-flow-xc7-server.test.js, #3147) and by Vivado (#1649); not in TARGETS (ISE's)
export const XC7_TARGETS = [{ board: 'basys3' }, { board: 'nexys-a7' }];
/** The board an example runs on for a target: vga on the iCEBreaker with its PmodVGA, on the ULX3S with its VGA. */
const VGA_BOARDS = { icebreaker: 'icebreaker-vga', ulx3s: 'ulx3s-vga', tangnano9k: 'tangnano9k-vga' };
export const exampleBoard = (name, t) => (name === 'vga' && VGA_BOARDS[t.board] ? { ...t, board: VGA_BOARDS[t.board] } : t);
/** A target's name: 'basys2-250', 'nexys3'. */
export const targetName = t => t.variant ? `${t.board}-${t.variant}` : t.board;

export function example(name) {
  const dir = path.join(ROOT, 'examples', name);
  const project = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const sources = project.files.map(f => ({ ...f, text: fs.readFileSync(path.join(dir, f.path), 'utf8') }));
  // a C function's module (isqrt): its HDL made from the C, as the application makes it (core/view-hdl.js), no file of its own
  const src = path.join(dir, 'src');
  for (const f of fs.readdirSync(src).filter(isCSource)) {
    const r = viewHdl(`src/${f}`, fs.readFileSync(path.join(src, f), 'utf8'), { lang: project.preferredLanguage });
    if (r.errors.length) throw new Error(r.errors.join('; '));
    sources.unshift({ path: `src/${f}.${r.lang === 'vhdl' ? 'vhd' : 'v'}`, lang: r.lang, role: 'design', text: r.text });
  }
  return { dir, project, sources, design: sources.filter(s => s.role === 'design'), sim: sources.filter(s => s.role === 'sim') };
}

const ucfPort = p => {
  const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar);
  return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null };
};

/** The constraints of an example's top on a board (a UCF, a PCF on the iCE40, an LPF on the ECP5, a CST on the Gowin): { text, board: resolved, unmatched }. */
export function exampleUcf(name, { board, variant }) {
  const ex = example(name);
  const r = resolveBoard(board, { variant });
  const b = { name: `${r.board.name}${r.variant ? ` ${r.variant.name || r.variant.id}` : ''}`, device: r.device, resources: r.resources };
  const design = elaborate(compile(ex.design), ex.project.top);
  const ports = design.top.ports.map(ucfPort);
  const { assignments, clocks, unmatched } = boardAutoAssign(ports, b);
  const text = boardConstraintsText({ device: r.device, board: { ...r.board, resources: r.resources }, ports, assignments, clocks, header: `UCF for top '${ex.project.top}' on ${r.board.name} (${r.device.part}${r.device.speed}-${r.device.package}), generated by Silinx` });
  return { text, device: r.device, unmatched };
}

// the simulated time an example's testbench may take (ps; 5 ms if not here): vga's looks at two whole frames
const SIM_TIME = { vga: 30e9 };

/** Runs an example's self-checking testbench in Silinx's simulator: { passed, log, now }.
 *  edit: { path: text } replaces sources (a mutated design: the testbench must then fail). */
export async function runTestbench(name, { until = SIM_TIME[name] || 5e9, edit = {} } = {}) {
  const { Simulator } = await import('../core/simulator.js');
  const { primitiveSources } = await import('../core/unisim.js');
  const ex = example(name);
  const all = ex.sources.map(s => (s.path in edit ? { ...s, text: edit[s.path] } : s));
  const lib = compile([...primitiveSources(all), ...all]);
  const errs = lib.errors.filter(e => e.severity === 'error');
  if (errs.length) throw new Error(`${name}: ${errs.map(e => `${e.file}:${e.line} ${e.message}`).join('; ')}`);
  const des = elaborate(lib, ex.project.simTop);
  const eerr = des.diags.filter(e => e.severity === 'error');
  if (eerr.length) throw new Error(`${name}: ${eerr.map(e => `${e.file}:${e.line} ${e.message}`).join('; ')}`);
  const sim = new Simulator(des, { files: new Map(all.map(s => [s.path, s.text])) });
  for (const s of des.signals) s.wave = null;
  const chunk = until / 200;
  let st;
  for (let t = chunk; ; t += chunk) {
    st = sim.run(Math.min(t, until));
    if (st.finished || t >= until || sim.log.some(e => /Simulation finished OK|ERROR/.test(e.text))) break;
  }
  const log = sim.log.map(e => e.text);
  return { passed: log.some(l => /Simulation finished OK/.test(l)) && !log.some(l => /ERROR/.test(l)) && !sim.log.some(e => e.kind === 'error'), log, now: st.now, warnings: [...des.diags.filter(e => e.severity === 'warning').map(e => e.message), ...sim.log.filter(e => e.kind === 'warning').map(e => e.text)] };
}

/** An example as a project folder for a target (its board's device and UCF), in `into`. */
export function exampleProject(name, target, into) {
  const ex = example(name);
  const dir = path.join(into, `${name}-${targetName(target)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(ex.dir, dir, { recursive: true, filter: f => !/[\\/]build$/.test(f) });
  const { text, device } = exampleUcf(name, target);
  const project = { ...ex.project, device, board: target.board, boardVariant: target.variant };
  // (another board than the example's: its clock and its inputs' levels as the top's generics, as New Project does, #3710)
  if (target.board !== ex.project.board) {
    const top = topForBoard(ex.design, ex.project.top, resolveBoard(target.board, { variant: target.variant }));
    if (top) fs.writeFileSync(path.join(dir, top.path), top.text);
  }
  // (the iCE40's constraints are a PCF, #2517; the ECP5's an LPF, #2302; the 7-series' an XDC, #3142: the example's UCF not kept)
  const ext = constraintsExtOf(device);
  if (!project.constraints.endsWith(ext)) {
    fs.rmSync(path.join(dir, project.constraints), { force: true });
    project.constraints = project.constraints.replace(/\.ucf$/, ext);
  }
  fs.writeFileSync(path.join(dir, project.constraints), text);
  fs.writeFileSync(path.join(dir, 'silinx.json'), `${JSON.stringify(project, null, 2)}\n`);
  return { dir, project };
}

/** The Silinx toolchain's whole flow on a project folder, as the application runs it: the job. */
export async function silinxFlow(dir, project, steps = ['synth', 'translate', 'map', 'par', 'trce', 'bitgen']) {
  const { createJob } = await import('../server/jobs.js');
  const { runOpenImplementation } = await import('../server/open-flow.js');
  const job = createJob('example', j => runOpenImplementation(j, { project, projectDir: dir, steps }));
  while (job.status === 'running') await new Promise(r => setTimeout(r, 200));
  return job;
}
