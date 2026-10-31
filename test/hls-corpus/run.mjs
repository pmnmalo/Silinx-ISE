#!/usr/bin/env node
// The HLS corpus (#1597): AMD's Vitis HLS Introductory Examples (manifest.json, pinned) through Silinx HLS's C simulation
// (the example's own test bench: its exit code 0), C synthesis (VHDL and Verilog) and C/RTL co-simulation, each
// design's results compared with expected.json. Not part of npm test: it needs the network once (the sources fetched
// into .cache/ by scripts/fetch-design-corpus.mjs, never committed).
//
//   npm run test:hls                       every design; fails on a difference from expected.json
//   npm run test:hls -- --filter pointer   the designs whose name has 'pointer'
//   npm run test:hls -- --update           the results recorded as the expectations, and the README's table
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDesignCorpus, sourceDir } from '../../scripts/fetch-design-corpus.mjs';
import { runDesign, compareExpectations, table } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const EXPECTED = path.join(HERE, 'expected.json');
const a = process.argv.slice(2);
const filter = a.includes('--filter') ? a[a.indexOf('--filter') + 1] : '';
const designs = manifest.designs.filter((d) => !filter || d.name.includes(filter));

// the files to fetch: a design's sources, its test bench's files and the headers beside them
const filesOf = (d) => [...d.files, ...d.tb, ...d.headers, ...(d.blackbox ? [...d.blackbox.descriptions, ...d.blackbox.files] : [])];
const fetchable = { ...manifest, designs: designs.map((d) => ({ ...d, files: filesOf(d) })) };
await fetchDesignCorpus({ manifest: fetchable, log: () => {} });
const results = {};
for (const d of designs) {
  const dir = sourceDir(manifest.sources[d.source]);
  const texts = Object.fromEntries(filesOf(d).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  const t0 = Date.now();
  // (an exception: the design's failure, its message the reason)
  try { results[d.name] = runDesign(d, texts); } catch (e) { results[d.name] = { csim: 'fail', synth: 'fail', cosim: 'skip', latency: null, reason: `exception: ${e.message}` }; }
  const r = results[d.name];
  console.log(`${d.name.padEnd(48)} ${r.csim.padEnd(5)} ${r.synth.padEnd(5)} ${r.cosim.padEnd(5)} ${((Date.now() - t0) / 1000).toFixed(1)} s${r.reason ? `  ${r.reason}` : ''}`);
}
if (a.includes('--update')) {
  const old = fs.existsSync(EXPECTED) ? JSON.parse(fs.readFileSync(EXPECTED, 'utf8')) : {};
  const all = { ...old, ...results };
  fs.writeFileSync(EXPECTED, `${JSON.stringify(Object.fromEntries(Object.entries(all).sort()), null, 2)}\n`);
  const readme = path.join(HERE, 'README.md');
  const text = fs.readFileSync(readme, 'utf8');
  fs.writeFileSync(readme, text.replace(/<!-- results -->[\s\S]*<!-- \/results -->/, `<!-- results -->\n${table(manifest, all)}\n<!-- /results -->`));
  console.log(`expected.json and the README's table updated (${Object.keys(results).length} designs)`);
} else {
  const expected = fs.existsSync(EXPECTED) ? JSON.parse(fs.readFileSync(EXPECTED, 'utf8')) : {};
  const diff = compareExpectations(results, expected);
  for (const x of diff) console.log(`DIFFERENT: ${x.name} ${x.stage}: expected ${x.expected}, got ${x.got}`);
  if (diff.length) process.exit(1);
  console.log(`${designs.length} designs as expected`);
}
