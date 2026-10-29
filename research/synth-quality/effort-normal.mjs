// Optimization Effort Normal against High on the design corpus (#468): each design synthesized at both
// efforts (synthesizeOpen, one Yosys at a time), with the netlist's estimated critical path (criticalDelay),
// its logic levels (logicLevels), its LUTs and the synthesis's time; what DEEP_RULE was chosen from
// (README.md, "Effort Normal: the deep designs mapped for speed"). The corpus's sources fetched first
// (scripts/fetch-design-corpus.mjs). One JSON line per design:
//
//   node research/synth-quality/effort-normal.mjs results.jsonl [name,name…]
//
// (Normal with depth: false, the usual mapping alone: as Normal was before #468)
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const R = new URL('../../', import.meta.url).pathname;
const { compile, elaborate } = await import(R + 'core/compile.js');
const { primitiveSources } = await import(R + 'core/unisim.js');
const { synthesizeOpen } = await import(R + 'core/synth-front.js');
const { criticalDelay, logicLevels } = await import(R + 'packages/silinx-fpga/src/synth-open.js');
const { yosysNode } = await import(R + 'packages/silinx-fpga/src/synth-open-node.js');
const { sourceDir } = await import(pathToFileURL(R + 'scripts/fetch-design-corpus.mjs').href);
const manifest = JSON.parse(fs.readFileSync(R + 'test/designs-corpus/manifest.json', 'utf8'));
const HERE = R + 'test/designs-corpus';
const out = process.argv[2], only = process.argv[3]?.split(',');
for (const d of manifest.designs) {
  if (only && !only.includes(d.name)) continue;
  const dir = sourceDir(manifest.sources[d.source]);
  try {
    const srcs = d.files.map(f => { const local = f.startsWith('local:'); const abs = local ? path.join(HERE, f.slice(6)) : path.join(dir, f);
      const lang = /\.(vhd|vhdl)$/i.test(f) ? 'vhdl' : 'verilog'; let text = fs.readFileSync(abs, 'utf8');
      if (lang === 'verilog' && d.defines) text = Object.entries(d.defines).map(([k, v]) => `\`define ${k} ${v}\n`).join('') + text;
      return { path: local ? f.slice(6) : f, lang, text, role: 'design' }; });
    const lib = compile([...primitiveSources(srcs), ...srcs]);
    if (lib.errors.some(e => e.severity === 'error')) { fs.appendFileSync(out, JSON.stringify({ name: d.name, skip: 'parse' }) + '\n'); continue; }
    const des = elaborate(lib, d.top, { generics: d.generics || {} });
    if (!des.top || des.diags.some(e => e.severity === 'error')) { fs.appendFileSync(out, JSON.stringify({ name: d.name, skip: 'elab' }) + '\n'); continue; }
    const res = { name: d.name };
    for (const effort of ['normal', 'high']) {
      const t = Date.now();
      const s = await synthesizeOpen(des, { run: yosysNode, effort, ...(effort === 'normal' && { depth: false }) });
      const j = s.files[`${s.top}.json`];
      res[effort] = { ns: +criticalDelay(j, s.top).toFixed(2), levels: logicLevels(j, s.top), luts: s.util.luts, sec: +((Date.now() - t) / 1000).toFixed(1), kept: s.depth?.kept || false, chains: s.chains?.length || 0 };
    }
    fs.appendFileSync(out, JSON.stringify(res) + '\n');
    console.log(JSON.stringify(res));
  } catch (e) { fs.appendFileSync(out, JSON.stringify({ name: d.name, error: String(e.message).slice(0, 200) }) + '\n'); }
}
