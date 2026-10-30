// silinx-fpga's command line (#1679, step 8 of the toolchain's separation, #1651): a design from Verilog or a Yosys
// JSON netlist and its UCF to the .bit, through the flow (runFlow) with its io on the disk, as Silinx ISE's server
// runs it (server/open-flow-run.js) without its front end: the Verilog is synthesized as it is, VHDL needs Silinx
// ISE. bin/silinx-fpga.js runs main(); the tests call it with their own output.
//   silinx-fpga build <file.v ...|netlist.json> --part xc3s250e-cp132-4 [--top name] [--ucf pins.ucf] [-o top.bit]
//     [--out-dir build] [--effort normal|high] [--seed N] [--no-replicate] [--engine silinx|nextpnr|auto] [--quiet]
// Writes into the out folder the synthesis's netlist (<top>.json), the placed and routed design (placed.xdl,
// routed.xdl), the timing report (timing.txt) and the .bit; prints the flow's log (its warnings, the timing summary).
// Exit codes: 0 built, 1 the flow failed (the design, the constraints, the routing), 2 the command line is wrong.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFlow, familyOfPart, splitBitPart, findDeviceGraph, loadDeviceCache, loadDb, hasBitDb, yosysNode, yosysWorkers, nextpnrNode } from './node.js';

const PKG = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));

export const USAGE = `usage:
  silinx-fpga build <file.v ...|netlist.json> --part <part> [options]   a design to its .bit
  silinx-fpga --version | help

  <part>           xc3s250e-cp132-4 (Basys2), xc3s100e-cp132-4, xc3s500e-fg320-4 (Nexys2), xc3s1200e-fg320-4
  --top <name>     the top module (default: the one no other module instantiates)
  --ucf <file>     the constraints: the pins (LOC), the clocks (PERIOD)
  -o <file.bit>    the bitstream (default: <out-dir>/<top>.bit)
  --out-dir <dir>  the netlist, the placed and routed XDL, the timing report (default: build)
  --effort normal|high   the optimization effort: more placements tried at high (default: normal)
  --seed <N>       the placer's first seed (default: 1)
  --no-replicate   no register replication on the critical path
  --engine silinx|nextpnr|auto   the place and route: Silinx's own (default), nextpnr's Spartan-3E (#2136: every
                   port needs a LOC), or auto: nextpnr when it can implement the design, else Silinx's
  --quiet          only the warnings, the errors and the result`;

const VALUED = new Set(['--part', '--top', '--ucf', '-o', '--out-dir', '--effort', '--seed', '--engine']);
const FLAGS = new Set(['--no-replicate', '--quiet']);

/** The command line's options: { command, files, part, top, ucf, out, outDir, effort, seed, replicate, engine, quiet }, or { command, error }. */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const o = { command, files: [], replicate: true, quiet: false, outDir: 'build', effort: 'normal', seed: 1, engine: 'silinx' };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (VALUED.has(a)) {
      const v = rest[++i];
      if (v == null || v.startsWith('--')) return { command, error: `${a} needs a value` };
      if (a === '--part') o.part = v;
      else if (a === '--top') o.top = v;
      else if (a === '--ucf') o.ucf = v;
      else if (a === '-o') o.out = v;
      else if (a === '--out-dir') o.outDir = v;
      else if (a === '--effort') o.effort = v;
      else if (a === '--seed') o.seed = Number(v);
      else if (a === '--engine') o.engine = v;
    } else if (FLAGS.has(a)) {
      if (a === '--no-replicate') o.replicate = false;
      else o.quiet = true;
    } else if (a.startsWith('-')) return { command, error: `unknown option ${a}` };
    else o.files.push(a);
  }
  if (command !== 'build') return o;
  if (!o.files.length) return { command, error: 'no design: give its Verilog files or its Yosys JSON netlist' };
  if (!o.part) return { command, error: '--part is needed (xc3s250e-cp132-4: the Basys2\'s)' };
  if (!['normal', 'high'].includes(o.effort)) return { command, error: `--effort ${o.effort}: normal or high` };
  if (!Number.isInteger(o.seed) || o.seed < 1) return { command, error: '--seed: a whole number from 1' };
  if (!['silinx', 'nextpnr', 'auto'].includes(o.engine)) return { command, error: `--engine ${o.engine}: silinx, nextpnr or auto` };
  return o;
}

/** A part as written (xc3s250e-cp132-4, xc3s250ecp132-4, xc3s250e-4-cp132): { part: 'xc3s250ecp132-4', device, pkg, speed, family }, or null. */
export function partOf(text) {
  const tokens = String(text || '').toLowerCase().split('-').filter(Boolean);
  const speed = tokens.find(t => /^\d+$/.test(t)) || '4';
  const sp = splitBitPart(tokens.filter(t => !/^\d+$/.test(t)).join(''));
  if (!sp) return null;
  return { part: `${sp.part}${sp.package}-${speed}`, device: sp.part, pkg: sp.package, speed, family: familyOfPart(sp.part) };
}

/** The top module of Verilog sources: the one no other module instantiates, or null when there is not exactly one. */
export function topOf(sources) {
  const text = sources.map(s => s.text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
  const modules = [...text.matchAll(/\bmodule\s+([A-Za-z_]\w*)/g)].map(m => m[1]);
  const used = new Set(modules.filter(m => new RegExp(`(^|[^\\w$])${m}\\s*(#\\s*\\(|[A-Za-z_]\\w*\\s*\\()`, 'm').test(text.replace(new RegExp(`\\bmodule\\s+${m}\\b`, 'g'), ''))));
  const tops = modules.filter(m => !used.has(m));
  return tops.length === 1 ? tops[0] : null;
}

/**
 * The Verilog's errors as Yosys reads it, each file by its name (the flow synthesizes them as one text, its lines not the
 * files'): its syntax, then the hierarchy under the top (a module missing). [] when none; each 'ERROR: <file>:<line>: …'.
 */
export async function verilogErrors(sources, top, run = yosysNode) {
  const lines = [];
  try {
    await run(['-q', '-p', `${sources.map(s => `read_verilog -sv ${s.path}`).join('; ')}; hierarchy -check -top ${top}`],
      Object.fromEntries(sources.map(s => [s.path, s.text])), l => lines.push(l));
    return [];
  } catch (e) {
    const errors = lines.filter(l => /\bERROR: /.test(l)).map(l => l.replace(/^([^\s:]+:\d+): ERROR: /, 'ERROR: $1: '));
    return errors.length ? errors : [`ERROR: ${e.message}`];
  }
}

/** The top module of a Yosys JSON netlist: the module marked top, else its only module. */
function netlistTop(json) {
  const mods = Object.entries(json.modules || {});
  const marked = mods.filter(([, m]) => Number(m.attributes?.top) === 1 || m.attributes?.top === '00000000000000000000000000000001');
  return marked.length === 1 ? marked[0][0] : mods.length === 1 ? mods[0][0] : null;
}

/**
 * Runs the command line; out(line) and err(line) print. Returns the exit code.
 */
export async function main(argv, { out = l => console.log(l), err = l => console.error(l) } = {}) {
  const o = parseArgs(argv);
  if (o.command === '--version') { out(`silinx-fpga ${PKG.version}`); return 0; }
  if (!o.command || o.command === 'help' || o.command === '--help' || o.command === '-h') { out(USAGE); return o.command ? 0 : 2; }
  const usage = (msg) => { err(`silinx-fpga: ${msg}`); err(USAGE); return 2; };
  if (o.error) return usage(o.error);
  if (o.command !== 'build') return usage(`unknown command ${o.command}`);

  const p = partOf(o.part);
  if (!p) return usage(`--part ${o.part}: not a part (xc3s250e-cp132-4)`);
  if (p.family !== 'spartan3e') return usage(`--part ${o.part}: the Silinx toolchain builds Spartan-3E parts`);
  const graph = findDeviceGraph(p.part);
  if (!graph || !hasBitDb(p.device, { pkg: p.pkg })) return usage(`--part ${o.part}: no device description or bit database of ${p.device}${p.pkg} (the Basys2's and the Nexys2's parts have them)`);

  for (const f of [...o.files, ...(o.ucf ? [o.ucf] : [])]) if (!fs.existsSync(f)) { err(`silinx-fpga: ${f}: no such file`); return 1; }
  const vhdl = o.files.filter(f => /\.vhdl?$/i.test(f)), json = o.files.filter(f => /\.json$/i.test(f));
  const verilog = o.files.filter(f => /\.s?v$/i.test(f) || /\.vh$/i.test(f));
  if (vhdl.length) { err(`silinx-fpga: ${vhdl.join(', ')}: VHDL needs Silinx ISE's front end; give Verilog or a Yosys JSON netlist`); return 1; }
  const other = o.files.filter(f => !vhdl.includes(f) && !json.includes(f) && !verilog.includes(f));
  if (other.length) return usage(`${other.join(', ')}: not Verilog (.v) or a Yosys JSON netlist (.json)`);
  if (json.length && (json.length > 1 || verilog.length)) return usage('a Yosys JSON netlist alone, or Verilog files');

  // the design: its Verilog, synthesized by the flow; or its netlist, read by the flow's translate
  const sources = verilog.map(f => ({ path: path.basename(f), lang: 'verilog', text: fs.readFileSync(f, 'utf8') }));
  let netlist = null, top = o.top;
  if (json.length) {
    netlist = fs.readFileSync(json[0], 'utf8');
    try { top ||= netlistTop(JSON.parse(netlist)); } catch (e) { err(`silinx-fpga: ${json[0]}: not a Yosys JSON netlist (${e.message})`); return 1; }
  } else top ||= topOf(sources);
  if (!top) return usage('the top module is not clear: give it with --top');
  if (new Set(sources.map(s => s.path)).size < sources.length) return usage('two Verilog files of the same name');
  if (sources.length) {
    const errors = await verilogErrors(sources, top);
    if (errors.length) { for (const e of errors) err(e); err('silinx-fpga: the design has errors'); return 1; }
  }

  const dir = o.outDir;
  const fileOf = name => path.join(dir, name.replace(/^open\//, ''));
  fs.mkdirSync(dir, { recursive: true });
  const written = {};
  let device = null, bitDb = null;
  const io = {
    log: (line) => {
      if (/^=== SILINX /.test(line)) return;
      if (/^(WARNING|ERROR)/.test(line)) err(line);
      else if (!o.quiet) out(line);
    },
    sources: () => sources,
    ucf: o.ucf ? fs.readFileSync(o.ucf, 'utf8') : null,
    ucfName: o.ucf ? path.basename(o.ucf) : null,
    device: () => (device ||= loadDeviceCache(graph)),
    bitDb: () => (bitDb ||= loadDb(`${p.device}${p.pkg}`, { graph: io.device() })),
    yosys: yosysWorkers(),
    nextpnr: nextpnrNode(),
    write: (name, data) => { const f = fileOf(name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); written[name] = f; return f; },
    read: (name) => (name === `open/${top}.json` && netlist != null ? netlist : (fs.existsSync(fileOf(name)) ? fs.readFileSync(fileOf(name), 'utf8') : null)),
    save: () => {},
  };
  const steps = [...(netlist == null ? ['synth'] : []), 'translate', 'map', 'par', 'trce', 'bitgen'];
  const spec = { top, part: p.part, device: p.device, pkg: p.pkg, family: p.family, steps, seed: o.seed, effort: 1,
    synthEffort: o.effort, replicate: o.replicate, startupClk: 'JtagClk', engine: o.engine };
  const r = await runFlow(spec, io);
  if (!r.ok) { err(`silinx-fpga: ${r.error}`); return 1; }
  const bit = written[`${top}.bit`];
  if (o.out && path.resolve(o.out) !== path.resolve(bit)) { fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true }); fs.copyFileSync(bit, o.out); }
  out(`${o.out || bit}: the bitstream of ${top} on ${p.part}`);
  return 0;
}
