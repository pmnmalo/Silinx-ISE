#!/usr/bin/env node
// Fetch the open-source designs of the design corpus (test/designs-corpus/manifest.json) at their
// pinned commits, for the corpus runner (test/designs-corpus/run.mjs). They are data: downloaded
// into .cache/designs-corpus/ (git-ignored), never committed. Each design's licence is recorded in
// the manifest (only permissive or copyleft open-source licences); the licence file of each
// repository is fetched beside its files.
//
//   node scripts/fetch-design-corpus.mjs [--force] [--filter name]
//
// Every file comes from https://raw.githubusercontent.com/<repo>/<commit>/<path> (a commit, never a
// branch: the same bytes on every run), into .cache/designs-corpus/<owner>__<repo>/<commit>/<path>.
//
// The sources are shared by the checkouts of the repository (#105): a git worktree (.claude/worktrees/…,
// or any `git worktree add`) reads and fetches them in its main checkout's .cache/designs-corpus, so
// they are downloaded once; pinned, they never change once fetched. What a run writes (results.json)
// is each checkout's own: corpusPaths.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'test', 'designs-corpus', 'manifest.json');

/**
 * The main checkout of the checkout at `root`: root itself, or, for a linked git worktree (its .git
 * is a file 'gitdir: <main>/.git/worktrees/<name>'), the folder of the repository's common .git
 * (the worktree's commondir). root when it is not a git checkout or its main checkout has no work
 * tree (a bare repository).
 */
export function mainCheckout(root) {
  const dotGit = path.join(root, '.git');
  let gitdir;
  try {
    if (!fs.statSync(dotGit).isFile()) return root;
    gitdir = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, 'utf8'))?.[1];
  } catch { return root; }
  if (!gitdir) return root;
  gitdir = path.resolve(root, gitdir);
  let common;
  try { common = path.resolve(gitdir, fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim()); } catch { return root; }
  return path.basename(common) === '.git' ? path.dirname(common) : root;
}

/**
 * The design corpus's folders for the checkout at `root`: sources, the fetched files (shared: the
 * main checkout's .cache/designs-corpus); results, the folder of a run's results.json (the checkout's
 * own .cache/designs-results, never under the sources: a worktree whose .cache/designs-corpus is a
 * link to the main checkout's still keeps its results).
 */
export function corpusPaths(root) {
  return { sources: path.join(mainCheckout(root), '.cache', 'designs-corpus'), results: path.join(root, '.cache', 'designs-results') };
}

export const CACHE = corpusPaths(ROOT).sources;

/** The folder of a pinned source: .cache/designs-corpus/<owner>__<repo>/<commit>. */
export const sourceDir = src => path.join(CACHE, src.repo.replace('/', '__'), src.commit);

/** Every repository path a design needs from its source (its files, its testbench's, the licence). */
export function remoteFiles(manifest, design) {
  const src = manifest.sources[design.source];
  const all = [...design.files, ...(design.testbench?.files || []), src.licenceFile];
  return [...new Set(all.filter(f => !f.startsWith('local:')))];
}

const safe = rel => !rel.split('/').includes('..') && !path.isAbsolute(rel);

/** Download what the designs need (once per file). Returns { fetched, cached }. */
export async function fetchDesignCorpus({ force = false, filter = '', log = console.log, manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) } = {}) {
  let fetched = 0, cached = 0;
  for (const d of manifest.designs) {
    if (filter && !d.name.includes(filter)) continue;
    const src = manifest.sources[d.source];
    const dir = sourceDir(src);
    for (const rel of remoteFiles(manifest, d)) {
      if (!safe(rel)) throw new Error(`${d.name}: unsafe path ${rel}`);
      const out = path.join(dir, rel);
      if (fs.existsSync(out) && !force) { cached++; continue; }
      const url = `https://raw.githubusercontent.com/${src.repo}/${src.commit}/${rel}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${d.name}: ${url}: HTTP ${res.status}`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      // written whole, then renamed: a run of another checkout never reads a half-written file
      const part = `${out}.${process.pid}.part`;
      fs.writeFileSync(part, Buffer.from(await res.arrayBuffer()));
      fs.renameSync(part, out);
      fetched++;
    }
  }
  log(`design corpus: ${fetched} files fetched, ${cached} cached (${path.relative(ROOT, CACHE)})`);
  return { fetched, cached };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--filter');
  fetchDesignCorpus({ force: a.includes('--force'), filter: i >= 0 ? a[i + 1] : '' }).catch(e => { console.error(e.message); process.exit(1); });
}
