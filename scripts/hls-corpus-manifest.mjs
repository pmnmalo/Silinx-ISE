#!/usr/bin/env node
// The manifest of the HLS corpus (#1597, test/hls-corpus/manifest.json): AMD's Vitis HLS Introductory Examples at a
// pinned commit, one design per example folder with an hls_config.cfg: its top function (syn.top), its design files
// (syn.file), its test bench's files (tb.file: sources and data), the headers beside them, its language (C when every
// source is .c, else C++). Written once from GitHub (the repository's tree and each config at that commit) and
// committed; the files themselves are fetched by scripts/fetch-design-corpus.mjs into .cache/, never committed.
//
//   node scripts/hls-corpus-manifest.mjs [--commit <sha>]     (default: the manifest's own commit)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HLS_MANIFEST = path.join(ROOT, 'test', 'hls-corpus', 'manifest.json');
const REPO = 'Xilinx/Vitis-HLS-Introductory-Examples';

/** An hls_config.cfg's keys: { top, files: [syn.file], tb: [tb.file], flow, clock, directives: [syn.directive.*] }. */
export function readConfig(text) {
  const r = { top: null, files: [], tb: [], blackbox: [], flow: null, clock: null, directives: [] };
  for (const raw of String(text).split('\n')) {
    const l = raw.replace(/#.*$/, '').trim();
    const m = /^([\w.]+)\s*=\s*(.*)$/.exec(l);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'syn.top') r.top = v;
    else if (k === 'syn.file') r.files.push(v);
    else if (k === 'tb.file') r.tb.push(v);
    else if (k === 'syn.blackbox.file') r.blackbox.push(v);
    else if (k === 'flow_target') r.flow = v;
    else if (k === 'clock') r.clock = v;
    else if (k.startsWith('syn.directive.')) r.directives.push(`${k.slice(14)} ${v}`);
  }
  return r;
}

/** A design of the manifest from its folder's config and the repository's paths. */
export function designOf(dir, cfg, paths) {
  const rel = (f) => path.posix.normalize(path.posix.join(dir, f));
  // (a tb.file may be a folder: its files; one the repository does not have is left out)
  const expand = (f) => (paths.includes(f) ? [f] : paths.filter((p) => p.startsWith(`${f}/`)));
  const files = cfg.files.map(rel).flatMap(expand), tb = cfg.tb.map(rel).flatMap(expand);
  const sources = [...files, ...tb].filter((f) => /\.(c|cc|cpp)$/.test(f));
  // (the headers of the folders of its sources: a config may name files of another folder, ../x.c)
  const dirs = new Set([dir, ...sources.map((f) => path.posix.dirname(f))]);
  const headers = paths.filter((p) => dirs.has(path.posix.dirname(p)) && /\.(h|hh|hpp)$/.test(p) && !files.includes(p));
  return {
    name: dir.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(),
    source: 'vitis-hls-examples', dir, top: cfg.top,
    language: sources.length && sources.every((f) => f.endsWith('.c')) ? 'c' : 'c++',
    files, tb, headers,
    // (syn.blackbox: its descriptions, and the C models and RTL beside them, #1903)
    ...(cfg.blackbox?.length ? { blackbox: { descriptions: cfg.blackbox.map(rel), files: paths.filter((p) => path.posix.dirname(p) === dir && /\.(c|cc|cpp|v|vhd|vhdl)$/.test(p) && !files.includes(p) && !tb.includes(p)) } } : {}),
    ...(cfg.directives.length ? { directives: cfg.directives } : {}),
  };
}

async function main() {
  const old = fs.existsSync(HLS_MANIFEST) ? JSON.parse(fs.readFileSync(HLS_MANIFEST, 'utf8')) : null;
  const i = process.argv.indexOf('--commit');
  const commit = i > 0 ? process.argv[i + 1] : old?.sources['vitis-hls-examples'].commit;
  if (!/^[0-9a-f]{40}$/.test(commit || '')) throw new Error('give the commit: --commit <40 hex digits>');
  const tree = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/git/trees/${commit}?recursive=1`], { encoding: 'utf8', maxBuffer: 64 << 20 }));
  const paths = tree.tree.filter((t) => t.type === 'blob').map((t) => t.path);
  const designs = [];
  for (const cfgPath of paths.filter((p) => p.endsWith('/hls_config.cfg')).sort()) {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${commit}/${cfgPath}`);
    if (!res.ok) throw new Error(`${cfgPath}: HTTP ${res.status}`);
    const cfg = readConfig(await res.text());
    if (!cfg.top || !cfg.files.length) continue;
    designs.push(designOf(path.posix.dirname(cfgPath), cfg, paths));
  }
  const manifest = {
    about: 'The HLS corpus (#1597): AMD\'s Vitis HLS Introductory Examples, written by scripts/hls-corpus-manifest.mjs; fetched by scripts/fetch-design-corpus.mjs, run by test/hls-corpus/run.mjs.',
    sources: { 'vitis-hls-examples': { repo: REPO, commit, url: `https://github.com/${REPO}`, licence: 'Apache-2.0', licenceFile: 'LICENSE.txt' } },
    designs,
  };
  fs.mkdirSync(path.dirname(HLS_MANIFEST), { recursive: true });
  fs.writeFileSync(HLS_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${designs.length} designs (${designs.filter((d) => d.language === 'c').length} in C) at ${commit.slice(0, 12)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
