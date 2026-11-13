// Project storage: one directory per project with a silinx.json descriptor.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { boardAutoAssign, boardConstraintsText, constraintsExtOf } from '../packages/silinx-fpga/src/parts.js';
import { resolveBoard } from './devices.js';
import { realOf, nativeRealOf, hiddenName, within } from './paths.js';
import { topNameError } from './ident.js';
import { filePath, normalizePath } from '../core/import-gate.js';
import { foldName, sameNameIn, spelledAs } from '../core/fold-name.js';
import { fsFailure } from './fs-error.js';
import { PROJECT_NAME_RE, projectNameError, sameProject } from '../core/project-name.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EXAMPLES_DIR = path.join(HERE, '..', 'examples');
// the test designs (#1746): the designs Silinx is tested with, a category of New Project's templates apart from the
// examples (core/test-designs.js)
export const TEST_DESIGNS_DIR = path.join(HERE, '..', 'test-designs');

/** The template folders of a kind (examples or test designs): the names of those that have a silinx.json. */
export function templateNames(dir) {
  let ents = [];
  try { ents = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return ents.filter(d => d.isDirectory() && fsSync.existsSync(path.join(dir, d.name, PROJECT_FILE))).map(d => d.name);
}

export const PROJECT_FILE = 'silinx.json';

/** An example's description and files: { project, files: { path: text } } (silinx.json apart; #2826: a link to it
 *  opens the project of that name as it is when it has the same files). */
export function exampleFiles(name) {
  const dir = path.join(EXAMPLES_DIR, String(name));
  if (!/^[a-z0-9_-]+$/i.test(String(name)) || !fsSync.existsSync(path.join(dir, PROJECT_FILE))) throw new HttpError(404, `unknown example '${name}'`);
  const files = {};
  const walk = sub => {
    for (const d of fsSync.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${d.name}` : d.name;
      if (d.isDirectory()) walk(rel);
      else if (d.isFile() && rel !== PROJECT_FILE) files[rel] = fsSync.readFileSync(path.join(dir, rel), 'utf8');
    }
  };
  walk('');
  return { project: JSON.parse(fsSync.readFileSync(path.join(dir, PROJECT_FILE), 'utf8')), files };
}

export function workspaceDir() {
  return process.env.SILINX_WORKSPACE || path.join(os.homedir(), 'Silinx-projects');
}

const projectFile = async dir => path.join(dir, PROJECT_FILE);

const NAME_RE = PROJECT_NAME_RE;   // (core/project-name.js: the page's, the stores', the MCP's, #3538)

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
// a file system error on `full` (in the project's folder `dir`) as an HttpError with the project's path (#3537), any
// other error as it is
const fsHttpError = async (e, dir, full) => { const f = await fsFailure(e, dir, full); return f ? new HttpError(f.status, f.message) : e; };

// (the name's rule keeps the folder in the workspace; the check after it says so where CodeQL's js/path-injection sees
// it, as safeJoin's: a resolved path that starts with its root's, #3648)
export function projectDir(name) {
  const bad = projectNameError(name);
  if (bad) throw new HttpError(400, bad);
  const ws = path.resolve(workspaceDir()), dir = path.resolve(ws, name);
  if (!dir.startsWith(ws + path.sep)) throw new HttpError(400, `invalid project name '${name}'`);
  return dir;
}

// Resolve a project-relative path, refusing anything that escapes the project folder (by a symbolic link too, #1234).
export function safeJoin(dir, rel) {
  if (!rel || typeof rel !== 'string') throw new HttpError(400, 'missing path');
  const root = path.resolve(dir), full = path.resolve(root, rel);
  if (full === root) return root;
  if (!full.startsWith(root + path.sep) || !within(dir, full)) throw new HttpError(400, 'path escapes project');
  return full;
}

export function langOf(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.v' || ext === '.vh' || ext === '.sv') return 'verilog';
  if (ext === '.vhd' || ext === '.vhdl') return 'vhdl';
  if (ext === '.ucf' || ext === '.pcf' || ext === '.lpf' || ext === '.cst' || ext === '.xdc') return 'ucf';
  return 'text';
}

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

// when a project last changed (ms): its newest file, the build's outputs and hidden folders aside (#1156)
async function lastChange(dir) {
  let t = 0;
  for (const ent of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (ent.name.startsWith('.') || ent.name === 'build') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) t = Math.max(t, await lastChange(p));
    else if (ent.isFile()) t = Math.max(t, (await fs.stat(p).catch(() => null))?.mtimeMs || 0);
  }
  return Math.round(t);
}

export async function listProjects() {
  const ws = workspaceDir();
  await fs.mkdir(ws, { recursive: true });
  const out = [];
  for (const ent of await fs.readdir(ws, { withFileTypes: true })) {
    // (a folder whose name is no project's is none, whatever it holds: no route opens it, #3522)
    if (!ent.isDirectory() || ent.name.startsWith('.') || !NAME_RE.test(ent.name)) continue;
    try {
      const dir = path.join(ws, ent.name);
      const pj = JSON.parse(await fs.readFile(await projectFile(dir), 'utf8'));
      out.push({ name: ent.name, device: pj.device, top: pj.top, board: pj.board, modified: await lastChange(dir) });
    } catch { /* not a project */ }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// a project cloned from a repository (#3195, server/git.js): untrusted until the user trusts it (#2830), its mark kept in
// .git, not in silinx.json, which stays the repository's (a clone shows no change). An untrusted project put in a
// repository keeps its mark there too (keepTrustInRepo), so that what git checks out (a pull, a merge) never trusts
// it: the project's own repository's .git/silinx-trust.json, or the workspace's .git/silinx-trust/<project>.json (a
// repository of several projects). A mark that cannot be read is an untrusted one.
export const CLONE_TRUST = path.join('.git', 'silinx-trust.json');
const trustMarks = dir => [path.join(dir, CLONE_TRUST), path.join(path.dirname(dir), '.git', 'silinx-trust', `${path.basename(dir)}.json`)];
const cloneTrust = dir => {
  for (const f of trustMarks(dir)) {
    let text;
    try { text = fsSync.readFileSync(f, 'utf8'); } catch { continue; }
    try { const m = JSON.parse(text); return m && typeof m === 'object' ? m : { trusted: false }; } catch { return { trusted: false }; }
  }
  return null;
};

/** An untrusted project in a repository (root: 'project', its own, or 'workspace', server/git.js repoOf): its mark kept
 *  in the repository's .git, never in what git tracks. A trusted project: nothing (false); fromOutside: one that a pull
 *  brought, untrusted whatever its silinx.json says. */
export async function keepTrustInRepo(name, root, { fromOutside = false } = {}) {
  const pj = await readProject(name);
  if (pj.trusted !== false && !fromOutside) return false;
  const f = trustMarks(projectDir(name))[root === 'workspace' ? 1 : 0];
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, JSON.stringify({ trusted: false, ...(pj.madeBy === 'mcp' ? { madeBy: 'mcp' } : {}) }) + '\n');
  return true;
}

export async function readProject(name) {
  const dir = projectDir(name);
  let pj;
  try { pj = JSON.parse(await fs.readFile(await projectFile(dir), 'utf8')); }
  catch { throw new HttpError(404, `project '${name}' not found`); }
  const ct = cloneTrust(dir);
  if (ct) Object.assign(pj, { trusted: false }, ct.madeBy ? { madeBy: ct.madeBy } : {});
  pj.name = name;
  pj.files ||= [];
  return pj;
}

// Per-project mutex: every read-modify-write of silinx.json runs under it, so concurrent requests
// (API, CLI, several browser tabs) cannot lose each other's updates.
const locks = new Map();
function withProjectLock(name, fn) {
  name = String(name).toLowerCase();   // case-insensitive file systems: Foo and foo are one folder
  const prev = locks.get(name) || Promise.resolve();
  const run = prev.then(() => fn());
  const tail = run.catch(() => {});
  locks.set(name, tail);
  tail.then(() => { if (locks.get(name) === tail) locks.delete(name); });
  return run;
}

// Windows refuses to rename over a file that another operation has open at that moment (a concurrent
// read of it: EPERM / EACCES / EBUSY), where other systems replace it: retried a few times, briefly
export async function renameOver(from, to, { tries = 10, wait = 15 } = {}) {
  for (let k = 0; ; k++) {
    try { return await fs.rename(from, to); } catch (e) {
      if (k >= tries - 1 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      await new Promise(r => setTimeout(r, wait * (k + 1)));
    }
  }
}

/** A file written atomically (a hidden temp file beside it, then renamed over it): a concurrent reader (a watcher,
 *  another process, a shared project's followers, #3183) or a crash never sees it half-written or empty. */
export async function writeAtomic(full, text) {
  const tmp = path.join(path.dirname(full), `.${path.basename(full)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);   // hidden: not listed
  try {
    await fs.writeFile(tmp, text);
    await renameOver(tmp, full);
  } catch (e) { await fs.rm(tmp, { force: true }).catch(() => {}); throw e; }
}

// Atomic write (temp file + rename): a concurrent reader never sees a half-written silinx.json.
// The top and simulation top must be identifiers (#1431): build/<top>.bit and the like are paths of the project.
async function writeProjectUnlocked(name, pj) {
  const dir = projectDir(name);
  const badTop = topNameError(pj);
  if (badTop) throw new HttpError(400, badTop);
  const clean = { ...pj, name };
  delete clean.fileTree;
  const ct = cloneTrust(dir);
  if (ct) { delete clean.trusted; delete clean.madeBy; }   // (a clone's: in .git, #3195)
  const file = path.join(dir, PROJECT_FILE);
  const tmp = path.join(dir, `.${PROJECT_FILE}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await fs.writeFile(tmp, JSON.stringify(clean, null, 2) + '\n');
    await renameOver(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  return ct ? { ...clean, trusted: false, ...(ct.madeBy ? { madeBy: ct.madeBy } : {}) } : clean;
}

export function writeProject(name, pj) {
  projectDir(name);
  return withProjectLock(name, async () => {
    // a project from outside stays so until the user trusts it (trustProject, #2830): a description written whole (the
    // interface's) does not make it trusted
    let cur = null;
    try { cur = await readProject(name); } catch { /* a new project */ }
    // (and who made it, the MCP server: its messages, #2981)
    return writeProjectUnlocked(name, cur?.trusted === false ? { ...pj, trusted: false, ...(cur.madeBy ? { madeBy: cur.madeBy } : {}) } : pj);
  });
}

/** The user trusts a project from outside (#2830): Xilinx ISE and programming may run for it. */
export async function trustProject(name) {
  const out = await updateProject(name, pj => { const { trusted, madeBy, ...rest } = pj; return rest; });   // eslint-disable-line no-unused-vars
  for (const f of trustMarks(projectDir(name))) await fs.rm(f, { force: true });
  return out;
}

/** Read silinx.json, let `fn(pj)` change it (or return a new object), write it back, all under the project lock. */
export function updateProject(name, fn) {
  projectDir(name);
  return withProjectLock(name, async () => {
    const pj = await readProject(name);
    const next = (await fn(pj)) ?? pj;
    return writeProjectUnlocked(name, next);
  });
}

async function walk(dir, base = '') {
  const out = [];
  for (const ent of await fs.readdir(path.join(dir, base), { withFileTypes: true })) {
    if (ent.name.startsWith('.') || (base === '' && ent.name === 'build')) continue;
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...await walk(dir, rel));
    // a symbolic link is not a project file (it may lead out of the project: an export would take
    // the file it points to)
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}

export async function fileTree(name) {
  return (await walk(projectDir(name))).filter(f => f !== PROJECT_FILE).sort();
}

const DEFAULT_DEVICE = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' };

async function copyDir(src, dst, { skipRoot = null } = {}) {
  await fs.mkdir(dst, { recursive: true });
  for (const ent of await fs.readdir(src, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || ent.name === skipRoot) continue;   // hidden files (a Mac's .DS_Store): not part of a project
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDir(s, d); else await fs.copyFile(s, d);
  }
}

// fromOutside: an import's project, trusted: false from its first write, so an import that fails halfway leaves no
// trusted project (#2956, core/trust.js)
// madeBy 'mcp': a project the MCP server makes, untrusted too, its messages saying so (#2981)
export async function createProject({ name, template = 'empty', device, board, fromOutside = false, madeBy = null }) {
  const dir = projectDir(name);
  // (one in another case too: the same folder on a case-insensitive file system, #3538)
  const other = sameProject(await fs.readdir(workspaceDir()).catch(() => []), name);
  if (other || await exists(dir)) throw new HttpError(409, `project '${other ?? name}' already exists`);
  if (template && template !== 'empty') {
    // an example, else a test design (#1746)
    const ok = /^[a-z0-9_-]+$/i.test(template);
    const src = [EXAMPLES_DIR, TEST_DESIGNS_DIR].map(d => path.join(d, template)).find(d => ok && fsSync.existsSync(path.join(d, PROJECT_FILE)));
    if (!src) throw new HttpError(400, `unknown template '${template}'`);
    // (its files without its silinx.json, written once below, already marked when the project is untrusted: never on
    // disk as a trusted project's in between, #3413)
    const pj = { ...JSON.parse(await fs.readFile(path.join(src, PROJECT_FILE), 'utf8')), name };
    pj.files ||= [];
    await copyDir(src, dir, { skipRoot: PROJECT_FILE });
    const was = `${pj.board}|${pj.device?.part}|${pj.device?.package}`;
    if (device) pj.device = device;
    if (board !== undefined) pj.board = board;
    // a device whose constraints are of another format (the 7-series' XDC, #3142): the example's file replaced by the board's
    const ext = constraintsExtOf(pj.device);
    if (pj.constraints && !pj.constraints.toLowerCase().endsWith(ext)) {
      await fs.rm(safeJoin(dir, pj.constraints), { force: true });
      pj.constraints = pj.constraints.replace(/\.[^./]*$/, '') + ext;
    }
    if (fromOutside) pj.trusted = false;
    if (madeBy === 'mcp') Object.assign(pj, { trusted: false, madeBy });
    const out = await writeProject(name, pj);
    // another board or device than the example's: its pins are the chosen board's (#36)
    if (pj.board && `${pj.board}|${pj.device?.part}|${pj.device?.package}` !== was) await boardConstraints(dir, pj);
    return out;
  }
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'sim'), { recursive: true });
  await fs.mkdir(path.join(dir, 'constraints'), { recursive: true });
  return writeProject(name, {
    name, version: 1, device: device || DEFAULT_DEVICE, board: board ?? null,
    top: '', simTop: '', files: [], constraints: `constraints/top${constraintsExtOf(device)}`,
    stimuli: {}, impl: { optMode: 'Area', optLevel: 2, startupClk: 'JtagClk' },
    ...(fromOutside ? { trusted: false } : {}),
    ...(madeBy === 'mcp' ? { trusted: false, madeBy } : {}),
  });
}

/** Writes a project's UCF from its board's pin table (ports matched by name: clk, led, sw, btn,
 *  seg, an…), as Update Constraints does in the interface. */
export async function boardConstraints(dir, pj) {
  const r = resolveBoard(pj.board, { part: pj.device?.part });
  if (!r || !pj.top) return;
  // (a constraints path that names the project's description or a hidden file, from a hand-made silinx.json: not
  // written, #3411)
  if (pj.constraints) {
    const n = normalizePath(pj.constraints);
    const reason = n.reason || (isProjectFile(n.path) ? `${PROJECT_FILE}, the project's description` : null);
    if (reason) throw new HttpError(400, `the constraints file '${pj.constraints}' is not written: ${reason}`);
  }
  const sources = [];
  for (const f of pj.files || []) {
    if (f.role === 'sim' || !/^(vhdl|verilog)$/.test(f.lang)) continue;
    try { sources.push({ path: f.path, lang: f.lang, text: await fs.readFile(safeJoin(dir, f.path), 'utf8') }); } catch { /* missing (or outside the project): skipped */ }
  }
  // the HDL of its drawings and C sources too (a test design's top is one, #1746)
  try {
    const { viewSources } = await import('./ise.js');
    for (const v of await viewSources(pj, dir, sources)) if (v.text) sources.push({ path: v.path, lang: v.lang, text: v.text });
  } catch { /* none */ }
  let design;
  try { design = elaborate(compile([...primitiveSources(sources), ...sources]), pj.top); } catch { return; }
  if (!design?.top) return;
  const ports = design.top.ports.map(p => {
    const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar);
    return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null };
  });
  const { assignments, clocks } = boardAutoAssign(ports, { name: r.board.name, device: r.device, resources: r.resources });
  const text = boardConstraintsText({ device: r.device, board: { ...r.board, resources: r.resources }, ports, assignments, clocks, header: `UCF for top '${pj.top}' on ${r.board.name} (${r.device.part}${r.device.speed}-${r.device.package}), generated by Silinx` });
  // (the project's own paths, as every other: inside its folder, #479; its folder made, as a test design has none, #1746)
  const file = safeJoin(dir, pj.constraints || `constraints/top${constraintsExtOf(r.device)}`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

export async function deleteProject(name) {
  const dir = projectDir(name);
  if (!await exists(dir)) throw new HttpError(404, 'not found');
  const trash = path.join(workspaceDir(), '.trash');
  await fs.mkdir(trash, { recursive: true });
  await fs.rename(dir, path.join(trash, `${path.basename(dir)}-${Date.now()}`));
  await fs.rm(trustMarks(dir)[1], { force: true });   // (the workspace repository's mark, #2830)
}

// project-relative path normalised to forward slashes, without './' or a trailing '/'
export const relKey = (dir, full) => path.relative(dir, full).split(path.sep).join('/');
// a name as a case-insensitive file system may read it (core/fold-name.js, shared with the browser, #3034)
export { foldName };
// (whatever its case: on a case-insensitive file system SILINX.JSON is the same file)
export const isProjectFile = key => foldName(key) === PROJECT_FILE;
// a path of the project that is its silinx.json, by its name or as the very same file on disk (#2956)
export async function isProjectFileAt(dir, full) {
  if (isProjectFile(relKey(dir, full))) return true;
  try {
    const [a, b] = await Promise.all([fs.stat(full), fs.stat(path.join(dir, PROJECT_FILE))]);
    return a.dev === b.dev && a.ino === b.ino;
  } catch { return false; }
}

// A hidden file or folder (.git/hooks, .vscode, .env) is no part of a project (#3036): no file route reads, writes, renames
// or deletes one (#3354), by its name or once its symbolic links are followed; a short (8.3) name, or a path the system
// names a hidden one, too (paths.js hiddenName, nativeRealOf). verb: what the route does ('read', 'written'…)
function refuseHidden(dir, rel0, full, verb) {
  const hidden = [relKey(dir, full), relKey(realOf(dir), realOf(full)), relKey(nativeRealOf(dir), nativeRealOf(full))].flatMap(k => k.split('/')).find(hiddenName);
  if (hidden) throw new HttpError(400, `'${rel0}': not ${verb}: hidden file or folder ('${hidden}')`);
}

// a folder that holds a hidden file or folder (a clone's .git, with its trust mark, #2830) is neither renamed nor deleted
// with it: the first one found, its path in the project; its symbolic links not followed (a rename or a delete moves or
// removes a link, not what it names); a Mac's .DS_Store (Finder's settings of the folder) apart
async function refuseHiddenInside(dir, rel0, full, verb) {
  const find = async d => {
    let ents;
    try { ents = await fs.readdir(d, { withFileTypes: true }); } catch { return null; }
    for (const e of ents) {
      if (e.name === '.DS_Store' && !e.isDirectory()) continue;
      if (hiddenName(e.name)) return path.join(d, e.name);
      const f = e.isDirectory() && await find(path.join(d, e.name));
      if (f) return f;
    }
    return null;
  };
  const found = await find(full);
  if (found) throw new HttpError(400, `'${rel0}': not ${verb}: the folder holds a hidden file or folder ('${relKey(dir, found)}')`);
}

// A path of the project with its folders and its file spelled as on disk (#3536: SRC/a.vhd is src/a.vhd when the
// project has src, on every system, as a case-insensitive file system reads it) -> its full path. last: false, the
// last name kept as asked (a rename's new name).
const namesIn = dir => async folder => { try { return await fs.readdir(path.join(dir, ...folder.split('/'))); } catch { return []; } };
export async function spelledJoin(dir, rel, { last = true } = {}) {
  // (the path by the browser store's rule: src/../x.v and src\y.v refused, not resolved by the system, #3598)
  const shape = filePath(rel);
  if (shape.reason) throw new HttpError(400, shape.message);
  const key = relKey(dir, safeJoin(dir, rel));
  return key ? safeJoin(dir, await spelledAs(key, namesIn(dir), { last })) : dir;
}

export async function readFile(name, rel) {
  const dir = projectDir(name);
  const full = await spelledJoin(dir, rel);
  refuseHidden(dir, rel, full, 'read');
  try { return await fs.readFile(full, 'utf8'); }
  catch { throw new HttpError(404, `file '${rel}' not found`); }
}

export async function writeFile(name, rel0, text) {
  const dir = projectDir(name);
  const full = await spelledJoin(dir, rel0);
  if (typeof text !== 'string') throw new HttpError(400, 'text: the whole text of the file');
  // the path as the project lists it (./src/a.vhd and src//a.vhd are src/a.vhd, #1229); silinx.json is the
  // project's description, written by the project's own routes (as the browser store refuses it)
  const rel = relKey(dir, full);
  if (!rel) throw new HttpError(400, 'missing path');
  if (await isProjectFileAt(dir, full)) throw new HttpError(400, `${PROJECT_FILE} is the project's description`);
  // no hidden file (refuseHidden); build/ is written here too (the browser's open synthesis saves its netlists in build/open/)
  refuseHidden(dir, rel0, full, 'written');
  // a name by the import gate's rules (#3414: no backslash, stream, trailing dot or space, invisible character…), as
  // Rename's; build/'s own files by the rest of their path
  const inBuild = /^build\//.test(rel);
  const gated = normalizePath(inBuild ? `b${rel.slice(5)}` : rel);   // (build/x as b/x: its own name checked)
  if (gated.reason) throw new HttpError(400, `'${rel0}': not written: ${gated.reason}`);
  // (onto a folder, or through a file: the project's path in the message, #3537)
  if ((await fs.stat(full).catch(() => null))?.isDirectory()) throw new HttpError(400, `'${rel}' is a folder, not a file`);
  try {
    await fs.mkdir(path.dirname(full), { recursive: true });
    await writeAtomic(full, text);   // (a reader, or a crash, never sees a half-written / empty file)
  } catch (e) { throw await fsHttpError(e, dir, full); }
  // Register HDL files automatically (not the generated ones in build/, e.g. the netlists of the open
  // synthesis); a file written again is back in the project (not excluded).
  const lang = langOf(rel);
  {
    const pj0 = await readProject(name);
    if ((pj0.excluded || []).includes(rel)) await updateProject(name, pj => { pj.excluded = (pj.excluded || []).filter(f => f !== rel); });
  }
  if ((lang === 'verilog' || lang === 'vhdl') && !/^build\//.test(rel)) {
    await withProjectLock(name, async () => {
      const pj = await readProject(name);
      if (!pj.files.some(f => f.path === rel)) {
        const role = /^(sim|tb|test)\//.test(rel) || /(^|\/)tb_|_tb\.|_tb$/.test(rel) ? 'sim' : 'design';
        pj.files.push({ path: rel, lang, role });
        await writeProjectUnlocked(name, pj);
      }
    });
  }
}



/** Move/rename a project file (or folder), keeping the project's file list and constraints path. */
// checkName: the new name by the import gate's rules for a name (the interface's Rename and MCP rename_file alike,
// #2973); false only to put a file back at the name it had (a rename undone)
export async function renameFile(name, from, to, { checkName = true } = {}) {
  const dir = projectDir(name);
  const src = await spelledJoin(dir, from), dst = await spelledJoin(dir, to, { last: false });
  if (src === dir || dst === dir) throw new HttpError(400, 'cannot rename the project folder itself');
  const fromKey = relKey(dir, src), toKey = relKey(dir, dst);
  if (await isProjectFileAt(dir, src) || await isProjectFileAt(dir, dst)) throw new HttpError(400, `${PROJECT_FILE} cannot be renamed`);
  refuseHidden(dir, from, src, 'renamed');
  const gated = checkName ? normalizePath(toKey) : {};
  if (gated.reason) throw new HttpError(400, `'${to}': not renamed: ${gated.reason}`);
  refuseHidden(dir, to, dst, 'renamed');   // (through a symbolic link too)
  return withProjectLock(name, async () => {
    let st;
    try { st = await fs.stat(src); } catch { throw new HttpError(404, `file '${from}' not found`); }
    const isDir = st.isDirectory();
    if (isDir) await refuseHiddenInside(dir, from, src, 'renamed');
    if (isDir && src !== dst && (dst + path.sep).startsWith(src + path.sep)) throw new HttpError(400, `cannot move '${from}' into itself`);
    // (a name the folder has in another case is taken too, but the file's own: a rename of its case, #3536)
    const taken = sameNameIn(path.basename(dst), await namesIn(dir)(relKey(dir, path.dirname(dst))));
    if (taken && path.join(path.dirname(dst), taken) !== src) throw new HttpError(409, `'${to}' already exists`);
    try {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.rename(src, dst);
    } catch (e) { throw await fsHttpError(e, dir, dst); }
    const pj = await readProject(name);
    // a file maps exactly; a folder maps every path below it
    const remap = p => {
      if (p === fromKey) return toKey;
      if (isDir && p.startsWith(fromKey + '/')) return toKey + p.slice(fromKey.length);
      return null;
    };
    pj.files = pj.files.map(f => {
      const np = remap(f.path);
      if (np === null) return f;
      const lang = langOf(np);
      return { ...f, path: np, lang: lang === 'vhdl' || lang === 'verilog' ? lang : f.lang };
    });
    if (pj.constraints) pj.constraints = remap(pj.constraints) ?? pj.constraints;
    // the files removed from the project stay removed at their new paths (#1228)
    if (pj.excluded) pj.excluded = pj.excluded.map(p => remap(p) ?? p);
    if (pj.sourceLanguage) pj.sourceLanguage = Object.fromEntries(Object.entries(pj.sourceLanguage).map(([p, l]) => [remap(p) ?? p, l]));
    return writeProjectUnlocked(name, pj);
  });
}

/** Delete a project file or folder (recursively) and unregister the files it contained. trash (the user's Delete File /
 *  Delete Folder, the MCP's delete_file, #3364): moved to the workspace's .trash folder, .trash/<project>-<time>/<path>,
 *  as a deleted project is, from where it can be moved back -> { trashed: its path in the workspace, else null }.
 *  mustExist (the route's, the MCP's, #3537): nothing at that path is a 404, else nothing to do. */
export async function deleteFile(name, rel, { trash = false, mustExist = false } = {}) {
  const dir = projectDir(name);
  const full = await spelledJoin(dir, rel);
  if (full === dir) throw new HttpError(400, 'cannot delete the project folder itself (delete the project instead)');
  const key = relKey(dir, full);
  if (await isProjectFileAt(dir, full)) throw new HttpError(400, `${PROJECT_FILE} cannot be deleted`);
  refuseHidden(dir, rel, full, 'deleted');
  let trashed = null;
  await withProjectLock(name, async () => {
    await refuseHiddenInside(dir, rel, full, 'deleted');
    const there = await fs.lstat(full).then(() => true, () => false);
    if (mustExist && !there) throw new HttpError(404, `no file or folder '${key}' in the project '${name}'`);
    try {
      if (trash && there) trashed = await toTrash(dir, full, key);
      else await fs.rm(full, { recursive: true, force: true });
    } catch (e) { throw await fsHttpError(e, dir, full); }
    const pj = await readProject(name);
    const gone = p => p === key || p.startsWith(key + '/');
    const before = JSON.stringify(pj);
    pj.files = pj.files.filter(f => !gone(f.path));
    // the constraints file deleted: none (as the browser store does, #1230); nothing left to exclude there
    if (pj.constraints && gone(pj.constraints)) pj.constraints = null;
    if (pj.excluded) pj.excluded = pj.excluded.filter(p => !gone(p));
    if (JSON.stringify(pj) !== before) await writeProjectUnlocked(name, pj);
  });
  return { trashed };
}
// a project's file or folder into the workspace's .trash, at .trash/<project>-<time>/<its path> -> that path (the
// workspace's, with '/'); dir: the project's folder (projectDir's)
async function toTrash(dir, full, key) {
  const trash = path.join(workspaceDir(), '.trash'), stamp = `${path.basename(dir)}-${Date.now()}`;
  let base = path.join(trash, stamp);
  for (let i = 2; await exists(base); i++) base = path.join(trash, `${stamp}-${i}`);
  const at = path.join(base, ...key.split('/'));
  await fs.mkdir(path.dirname(at), { recursive: true });
  await fs.rename(full, at);
  return relKey(workspaceDir(), at);
}

export async function readSources(name) {
  const pj = await readProject(name);
  const out = [];
  for (const f of pj.files) {
    try { out.push({ ...f, text: await readFile(name, f.path) }); }
    catch { out.push({ ...f, text: '', missing: true }); }
  }
  return out;
}
