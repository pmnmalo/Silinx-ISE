// ABC9 on the Spartan-3E (#369): Yosys's `synth_xilinx -abc9` failed on xc3se in YoWASP 0.68 and runs in 0.70.
// This measures its LUT mapping against the open synthesis's, on the examples and the design corpus's
// representative subset (scripts/yosys-update-report.mjs DESIGN_SUBSET), each mapping through the open back end
// (pack, place and route as the app's flow, Silinx's static timing analysis of the routed design). Four mappings,
// the same front end (core/synth-verilog.js) and the same steps up to the LUT mapping (core/synth-open.js
// synthCommands: tables, shift registers in SRL16E):
//   now    what the open synthesis does (synthesizeOpen: LUT4s alone, the wider and the depth-oriented
//          mappings tried, carry chains of gates, each kept by DEPTH_RULE)
//   lut4   its usual mapping alone (abc -luts 1,1,1,1: one Yosys run)
//   abc9   synth_xilinx's own map_luts with -abc9 (ABC9's &if with LUTs up to 8 inputs, then split into LUT4s and
//          MUXF5-8 by lut_map.v)
//   abc9-4 the same with -nowidelut (ABC9 onto LUT4s alone)
// Each netlist is also simulated against the RTL (test/diff-synth.js compareNetlist, the bare design: a mapping
// that changes the function is no mapping).
//
//   node research/synth-quality/abc9.mjs [--filter blinky,serv] [--ways now,abc9] [--seed 1] [--cycles 200] [--out results.json]
//   node research/synth-quality/abc9.mjs --table results.json     the Markdown table of a run (README.md, "ABC9")
//
// The corpus's sources: npm run fetch:designs. Research, not a test: nothing fails on a worse result.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthCommands, yosysFiles, SRL_CELLS_FILE, YOSYS_FAMILY } from '../../core/synth-open.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const EXAMPLES = ['gates', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock'];
export const WAYS = ['now', 'lut4', 'abc9', 'abc9-4'];

/** The Yosys commands of a mapping with ABC9: the open synthesis's up to the LUT mapping, then synth_xilinx's own
 *  map_luts step with -abc9 (wide: false, also -nowidelut) and the rest of it. */
export function abc9Commands(top, { wide = true } = {}) {
  const synth = `synth_xilinx -family ${YOSYS_FAMILY.spartan3e} -ise -flatten -top ${top}`;
  const cmds = synthCommands(top, 'spartan3e');
  const at = cmds.indexOf('; opt_expr -mux_undef -noclkinv;');
  if (at < 0) throw new Error('abc9Commands: no LUT mapping step in synthCommands');
  return `${cmds.slice(0, at)}; ${synth} -abc9${wide ? '' : ' -nowidelut'} -run map_luts:`;
}

/** The Yosys script of a way other than `now`: read the flat module, map it, write the netlist. */
export function wayScript(way, top) {
  const cmds = way === 'lut4' ? synthCommands(top, 'spartan3e') : way === 'abc9' ? abc9Commands(top) : way === 'abc9-4' ? abc9Commands(top, { wide: false }) : null;
  if (!cmds) throw new Error(`no such way: ${way}`);
  return `read_verilog -lib ${SRL_CELLS_FILE}; read_verilog -sv ${top}_syn.v; ${cmds}; delete t:$scopeinfo; write_json ${top}.json; write_verilog -noattr ${top}_yosys.v`;
}

const geo = xs => (xs.length ? Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length) : NaN);

/** The Markdown table of a run (results: { design: { way: { luts, muxf, ffs, slices, period, seconds, diff } } }),
 *  then the geometric means of each way against `now` over the designs every way of which was routed. */
export function table(results, ways = WAYS) {
  const f = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '–');
  const L = ['| design | way | LUTs | MUXF | FFs | slices | period (ns) | synthesis (s) | netlist vs RTL |', '|---|---|---:|---:|---:|---:|---:|---:|---|'];
  for (const [name, r] of Object.entries(results)) {
    for (const w of ways) {
      const m = r[w];
      if (!m) continue;
      if (m.error) { L.push(`| ${name} | ${w} | (${m.error}) | | | | | | |`); continue; }
      L.push(`| ${name} | ${w} | ${f(m.luts)} | ${f(m.muxf)} | ${f(m.ffs)} | ${f(m.slices)} | ${f(m.period, 2)} | ${f(m.seconds, 1)} | ${m.diff ?? '–'} |`);
    }
  }
  const done = Object.values(results).filter(r => ways.every(w => Number.isFinite(r[w]?.period) && r[w].luts > 0));
  L.push('', `Geometric means against \`now\` (${done.length} designs routed every way): LUTs / slices / period / synthesis time`, '');
  for (const w of ways.filter(x => x !== 'now')) {
    const ratio = k => geo(done.map(r => r[w][k] / r.now[k]).filter(Number.isFinite));
    L.push(`- ${w}: ${['luts', 'slices', 'period', 'seconds'].map(k => f(ratio(k), 3)).join(' / ')}`);
  }
  return L.join('\n');
}

// ------------------------------------------------------------------------------------------- the measurement
async function load() {
  const { compile, elaborate } = await import('../../core/compile.js');
  const { primitiveSources } = await import('../../core/unisim.js');
  const lib = await import('../../test/designs-corpus/lib.mjs');
  const { DESIGN_SUBSET } = await import('../../scripts/yosys-update-report.mjs');
  const { sourceDir } = await import('../../scripts/fetch-design-corpus.mjs');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/manifest.json'), 'utf8'));
  const designs = [];
  const build = (name, srcs, top, generics, extra) => {
    const l = compile([...primitiveSources(srcs), ...srcs]);
    const design = elaborate(l, top, { generics });
    const errs = [...l.errors, ...design.diags].filter(e => e.severity === 'error');
    return errs.length ? { name, error: `front end: ${errs[0].message}` } : { name, design, srcs, ...extra };
  };
  for (const e of EXAMPLES) {
    const dir = path.join(ROOT, 'examples', e);
    const proj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
    const srcs = proj.files.filter(f => (f.role || 'design') === 'design' && (f.lang === 'vhdl' || f.lang === 'verilog'))
      .map(f => ({ path: f.path, lang: f.lang, text: fs.readFileSync(path.join(dir, f.path), 'utf8') }));
    const { part, package: pkg, speed } = proj.device;
    designs.push(build(`examples/${e}`, srcs, proj.top, {}, { parts: [`${part}${pkg}${speed}`], ucf: proj.constraints ? fs.readFileSync(path.join(dir, proj.constraints), 'utf8') : null }));
  }
  for (const n of DESIGN_SUBSET) {
    const d = manifest.designs.find(x => x.name === n);
    const dir = sourceDir(manifest.sources[d.source]);
    const read = f => {
      const local = f.startsWith('local:');
      const lang = /\.(vhd|vhdl)$/i.test(f) ? 'vhdl' : 'verilog';
      let text = fs.readFileSync(local ? path.join(ROOT, 'test/designs-corpus', f.slice(6)) : path.join(dir, f), 'utf8');
      if (lang === 'verilog' && d.defines) text = Object.entries(d.defines).map(([k, v]) => `\`define ${k} ${v}\n`).join('') + text;
      return { path: local ? f.slice(6) : f, lang, text };
    };
    let srcs;
    try { srcs = d.files.map(read); } catch (e) { designs.push({ name: n, error: `not fetched (npm run fetch:designs): ${e.message}` }); continue; }
    designs.push(build(n, srcs, d.top, d.generics || {}, { corpus: d, parts: lib.FLOW_PARTS.slice(Math.max(0, lib.FLOW_PARTS.findIndex(p => p.startsWith(d.size?.target || 'xc3s250e')))) }));
  }
  return { designs, compile, elaborate, primitiveSources, lib };
}

async function measure(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const only = arg('--filter') ? arg('--filter').split(',') : null;
  const ways = arg('--ways') ? arg('--ways').split(',') : WAYS;
  const seed = +arg('--seed', 1), cycles = +arg('--cycles', 200);
  const outFile = arg('--out', path.join(HERE, 'abc9-results.json'));
  const { toVerilog } = await import('../../core/synth-verilog.js');
  const { synthesizeOpen, cellCounts, utilization } = await import('../../core/synth-open.js');
  const { yosysNode } = await import('../../core/synth-open-node.js');
  const { compareNetlist } = await import('../../test/diff-synth.js');
  const { readYosysJson } = await import('../../core/fpga/netlist.js');
  const { pack } = await import('../../core/fpga/pack.js');
  const { deviceSites } = await import('../../core/fpga/place.js');
  const { placeRouteBest } = await import('../../core/fpga/place-route.js');
  const { loadDeviceCache } = await import('../../core/fpga/device-node.js');
  const { knownRouting } = await import('../../core/fpga/bitgen.js');
  const { analyzeTiming, delayTable } = await import('../../core/fpga/timing.js');
  const { writeXdl, parseXdl } = await import('../../core/xdl.js');
  const { loadDb } = await import('../s3e-bitstream/db.mjs');
  const { designs, compile, elaborate, primitiveSources, lib } = await load();
  const devices = new Map();
  const deviceOf = part => {
    if (!devices.has(part)) {
      const device = loadDeviceCache(part);
      const known = knownRouting(loadDb(part, { graph: device }));
      devices.set(part, { device, sites: deviceSites(device), known, delays: delayTable(device, { allowPip: known.allowPip }) });
    }
    return devices.get(part);
  };
  const synth = async (design, way) => {
    const t0 = Date.now();
    let syn;
    if (way === 'now') syn = await synthesizeOpen(design, { run: yosysNode });
    else {
      const { text, top } = toVerilog(design);
      const out = await yosysNode(['-q', '-p', wayScript(way, top)], yosysFiles(top, text));
      if (!out[`${top}.json`]) throw new Error('Yosys wrote no netlist');
      syn = { top, files: { [`${top}.json`]: out[`${top}.json`], [`${top}_yosys.v`]: out[`${top}_yosys.v`] }, cells: cellCounts(out[`${top}.json`], top) };
    }
    return { syn, seconds: (Date.now() - t0) / 1000 };
  };
  const results = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  for (const d of designs) {
    if (only && !only.some(o => d.name.includes(o))) continue;
    results[d.name] = results[d.name] || {};
    if (d.error) { for (const w of ways) results[d.name][w] = { error: d.error }; continue; }
    // the design itself on the pads, or the corpus's I/O wrapper around it (as test/designs-corpus/run.mjs)
    const ports = d.design.top.ports.map(p => ({ name: p.name, dir: p.dir, w: p.sig.t.w }));
    let flowDesign = d.design, ucf = d.ucf ?? null;
    if (d.corpus) {
      const c = d.corpus, pads = deviceOf(d.parts[0]).sites.pads;
      const bits = ports.reduce((s, p) => s + p.w, 0), outBits = ports.filter(p => p.dir !== 'in').reduce((s, p) => s + p.w, 0);
      const outPads = [...pads.values()].filter(p => !p.inputOnly).length;
      let clk = ports.find(p => p.dir === 'in' && p.w === 1 && c.clock && p.name.toLowerCase() === c.clock.toLowerCase())?.name;
      if (bits > pads.size || outBits > outPads || ports.some(p => p.dir === 'inout')) {
        const clocks = [c.clock, ...(c.clocks || [])].filter(Boolean).filter(k => ports.some(p => p.name.toLowerCase() === k.toLowerCase()));
        const wrap = lib.ioWrapper(d.design.top.name, ports, { clocks, generics: c.generics || {} });
        const srcs = [...d.srcs, { path: 'corpus_io_wrap.v', lang: 'verilog', text: wrap.text }];
        flowDesign = elaborate(compile([...primitiveSources(srcs), ...srcs]), wrap.name);
        clk = 'clk';
      }
      ucf = clk ? lib.boardClockUcf(clk) : null;
    }
    for (const way of ways) {
      process.stdout.write(`${d.name} ${way} … `);
      const m = {};
      try {
        const bare = await synth(d.design, way);
        Object.assign(m, { seconds: +bare.seconds.toFixed(1) });
        const u = utilization(bare.syn.cells);
        Object.assign(m, { luts: u.luts, muxf: u.muxes, ffs: u.flipFlops });
        const sim = { cycles, ...(d.corpus?.sim || {}) };
        if (d.corpus?.clock && !sim.clock) sim.clock = d.corpus.clock;
        try {
          const r = compareNetlist(d.design, bare.syn, { name: d.name, seed: d.name, sim });
          m.diff = r.status === 'pass' ? 'pass' : `${r.status}${r.reason ? `: ${String(r.reason).slice(0, 80)}` : ''}`;
        } catch (e) { m.diff = `error: ${e.message.slice(0, 80)}`; }
        const flowSyn = flowDesign === d.design ? bare.syn : (await synth(flowDesign, way)).syn;
        const netlist = readYosysJson(flowSyn.files[`${flowSyn.top}.json`]);
        for (const part of d.parts) {
          const dev = deviceOf(part);
          const packed = pack(netlist, { ucf, part, carryOut: 'xor' });
          if (packed.stats.slices > dev.sites.slices.size) continue;
          let pr;
          try { pr = placeRouteBest(netlist, packed, dev.device, dev.known, { seed, delays: dev.delays, pack: { ucf, part, carryOut: 'xor' } }); }
          catch (e) { if (/slices needed|block RAMs needed|multipliers needed|no room|not enough pads|no pad for/.test(e.message)) continue; throw e; }
          if (pr.routed.errors.length || pr.routed.failed.length || pr.routed.overused) throw new Error(`route: ${pr.routed.errors[0] || `${pr.routed.failed.length} nets unrouted, ${pr.routed.overused} nodes shared`}`);
          const sta = analyzeTiming(parseXdl(writeXdl(pr.routed.design)), dev.device);
          const q = lib.qualityOf(part, pr.packed.stats, sta.clocks);
          Object.assign(m, { part, slices: q.slices, period: q.period });
          break;
        }
        if (!m.part) m.error = 'too large for the devices of the flow';
      } catch (e) { m.error = e.message.replace(/\s+/g, ' ').slice(0, 120); }
      results[d.name][way] = m;
      console.log(JSON.stringify(m));
      fs.writeFileSync(outFile, `${JSON.stringify(results, null, 1)}\n`);
    }
  }
  console.log(`\n${table(results, ways)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--table');
  if (i > 0) console.log(table(JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'))));
  else await measure(process.argv.slice(2));
}
