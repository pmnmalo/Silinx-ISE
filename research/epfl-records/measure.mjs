// Silinx's synthesis on the EPFL combinational benchmarks (lsils/benchmarks), mapped to 6-input LUTs and compared
// with the best-known results of the EPFL synthesis competition (#367). The Spartan-3E has 4-input LUTs, so the
// device results of the design corpus (docs/QUALITY.md) do not compare with those records; this measurement does:
// the same front end (Silinx reads and elaborates the benchmark, core/synth-verilog.js writes it as one flat module)
// and Yosys / ABC, but the LUTs 6 inputs wide, their count and their levels (the longest path in LUTs) against the
// best-known count (the size record) and the best-known levels (the depth record), from records.json.
//
// Two mappings of each benchmark, as the open synthesis makes them (packages/silinx-fpga/src/synth-open.js):
//   area:  Yosys's synth -lut 6 (ABC's default LUT script: strash; …; dch -f; if; mfs2)
//   depth: the logic balanced first (DEPTH_ABC: strash; dc2; balance; dch -f; if -g; …; if; mfs2), mapped to LUT-6
//
//   node --stack-size=7800 --max-old-space-size=8192 research/epfl-records/measure.mjs [--filter adder,bar] [--out results.json] [--timeout 600]
//   (the larger stack and heap: Yosys in WebAssembly recurses deep on sqrt; div, hyp, mem_ctrl exhaust its memory even so)
//   node research/epfl-records/measure.mjs --table results.json     the Markdown table of a run (docs/QUALITY.md)
//
// The benchmarks are read from the design corpus's sources (npm run fetch:designs, test/designs-corpus/manifest.json,
// the epfl source at its pinned commit). Research, not a test: nothing fails on a worse result.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../../core/compile.js';
import { toVerilog } from '../../core/synth-verilog.js';
import { DEPTH_ABC } from '../../packages/silinx-fpga/src/synth-open.js';
import { corpusPaths } from '../../scripts/fetch-design-corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const RECORDS = JSON.parse(fs.readFileSync(path.join(HERE, 'records.json'), 'utf8'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

/** The Yosys scripts of the two mappings of the flat module `top` (file `file`). */
export function scripts(file, top) {
  const head = `read_verilog -sv ${file}; hierarchy -top ${top}`;
  const tail = 'opt_clean; tee -q -o stat.txt stat; tee -q -o ltp.txt ltp -noff';
  // (an inline ABC script: commas for spaces, as packages/silinx-fpga/src/synth-open.js abcInline writes it)
  const depth = `+${DEPTH_ABC.split(';').map(c => c.trim().replace(/\s+/g, ',')).join(';')}`;
  return {
    area: `${head}; synth -flatten -top ${top} -lut 6; ${tail}`,
    depth: `${head}; synth -flatten -top ${top} -noabc; abc -lut 6 -script ${depth}; ${tail}`,
  };
}
/** The LUTs and the levels of a mapping, from Yosys's stat and ltp outputs. */
export function parseCounts(stat, ltp) {
  const luts = [...String(stat).matchAll(/^\s+(\d+)\s+\$lut\s*$/gm)].reduce((n, m) => n + Number(m[1]), 0)
    || Number(/\$lut\s+(\d+)/.exec(String(stat))?.[1] ?? NaN);
  const levels = Number(/length=(\d+)/.exec(String(ltp))?.[1] ?? NaN);
  return { luts, levels };
}

async function measure(name, rec, dir, timeoutS) {
  const { yosysNode } = await import('../../packages/silinx-fpga/src/synth-open-node.js');
  const text = fs.readFileSync(path.join(dir, rec.file), 'utf8');
  const lib = compile([{ path: rec.file, lang: 'verilog', text }]);
  const design = elaborate(lib, rec.top || 'top');
  const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
  if (errs.length) return { error: `front end: ${errs[0].message}` };
  const flat = toVerilog(design);
  const out = {};
  for (const [kind, script] of Object.entries(scripts('flat.v', flat.top))) {
    const t0 = Date.now();
    const timer = new Promise((_, rej) => setTimeout(() => rej(new Error(`more than ${timeoutS} s`)), timeoutS * 1000).unref());
    try {
      const r = await Promise.race([yosysNode(['-q', '-p', script], { 'flat.v': flat.text }), timer]);
      out[kind] = { ...parseCounts(r['stat.txt'], r['ltp.txt']), seconds: Math.round((Date.now() - t0) / 100) / 10 };
    } catch (e) { out[kind] = { error: e.message }; }
  }
  return out;
}

/** The Markdown table of a run's results. */
export function table(results) {
  const r1 = x => (Number.isFinite(x) ? x.toFixed(2) : '–');
  const L = ['| benchmark | LUT-6 area map | levels | best count | count / best | LUT-6 depth map | levels | best levels | levels / best |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const [name, rec] of Object.entries(RECORDS.benchmarks)) {
    const r = results[name];
    if (!r) continue;
    const a = r.area || {}, d = r.depth || {};
    const cell = (m, k) => (m.error ? (k === 'luts' ? `(${m.error})` : '') : m[k] ?? '–');
    L.push(`| ${name} | ${cell(a, 'luts')} | ${cell(a, 'levels')} | ${rec.size.luts} | ${r1(a.luts / rec.size.luts)} | ${cell(d, 'luts')} | ${cell(d, 'levels')} | ${rec.depth.levels} | ${r1(d.levels / rec.depth.levels)} |`);
  }
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (arg('--table')) { console.log(table(JSON.parse(fs.readFileSync(arg('--table'), 'utf8')))); process.exit(0); }
  const dir = path.join(corpusPaths(ROOT).sources, `${RECORDS.source.repo.replace('/', '__')}`, RECORDS.source.commit);
  if (!fs.existsSync(dir)) { console.error(`${dir}: not fetched (npm run fetch:designs)`); process.exit(2); }
  const only = arg('--filter') ? new Set(arg('--filter').split(',')) : null;
  const outFile = arg('--out', path.join(HERE, 'results.json'));
  const results = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  for (const [name, rec] of Object.entries(RECORDS.benchmarks)) {
    if (only && !only.has(name)) continue;
    process.stdout.write(`${name} … `);
    results[name] = await measure(name, rec, dir, Number(arg('--timeout', 600)));
    console.log(JSON.stringify(results[name]));
    fs.writeFileSync(outFile, `${JSON.stringify(results, null, 1)}\n`);
  }
  console.log(`\n${table(results)}`);
}
