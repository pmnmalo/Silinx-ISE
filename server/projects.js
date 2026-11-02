// Project storage: one directory per project with a silinx.json descriptor.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { boardAutoAssign, boardConstraintsText, openOnlyDevice } from '../packages/silinx-fpga/src/parts.js';
import { resolveBoard } from './devices.js';
import { within } from './paths.js';
import { topNameError } from './ident.js';

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

export function workspaceDir() {
  return process.env.SILINX_WORKSPACE || path.join(os.homedir(), 'Silinx-projects');
}

const projectFile = async dir => path.join(dir, PROJECT_FILE);

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function projectDir(name) {
  if (!NAME_RE.test(name || '')) throw new HttpError(400, `invalid project name '${name}'`);
  return path.join(workspaceDir(), name);
}

// Resolve a project-relative path, refusing anything that escapes the project folder (by a symbolic link too, #1234).
export function safeJoin(dir, rel) {
  if (!rel || typeof rel !== 'string') throw new HttpError(400, 'missing path');
  const full = path.resolve(dir, rel);
  if (!within(dir, full)) throw new HttpError(400, 'path escapes project');
  return full;
}

export function langOf(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.v' || ext === '.vh' || ext === '.sv') return 'verilog';
  if (ext === '.vhd' || ext === '.vhdl') return 'vhdl';
  if (ext === '.ucf' || ext === '.pcf') return 'ucf';
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
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    try {
      const dir = path.join(ws, ent.name);
      const pj = JSON.parse(await fs.readFile(await projectFile(dir), 'utf8'));
      out.push({ name: ent.name, device: pj.device, top: pj.top, board: pj.board, modified: await lastChange(dir) });
    } catch { /* not a project */ }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readProject(name) {
  const dir = projectDir(name);
  let pj;
  try { pj = JSON.parse(await fs.readFile(await projectFile(dir), 'utf8')); }
  catch { throw new HttpError(404, `project '${name}' not found`); }
  pj.name = name;
  pj.files ||= [];
  return pj;
}

// Per-project mutex: every read-modify-write of silinx.json runs under it, so concurrent requests
// (API, CLI, several browser tabs) cannot lose each other's updates.
const locks = new Map();
export function withProjectLock(name, fn) {
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

// Atomic write (temp file + rename): a concurrent reader never sees a half-written silinx.json.
// The top and simulation top must be identifiers (#1431): build/<top>.bit and the like are paths of the project.
async function writeProjectUnlocked(name, pj) {
  const dir = projectDir(name);
  const badTop = topNameError(pj);
  if (badTop) throw new HttpError(400, badTop);
  const clean = { ...pj, name };
  delete clean.fileTree;
  const file = path.join(dir, PROJECT_FILE);
  const tmp = path.join(dir, `.${PROJECT_FILE}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await fs.writeFile(tmp, JSON.stringify(clean, null, 2) + '\n');
    await renameOver(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  return clean;
}

export function writeProject(name, pj) {
  projectDir(name);
  return withProjectLock(name, () => writeProjectUnlocked(name, pj));
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

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const ent of await fs.readdir(src, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;   // hidden files (a Mac's .DS_Store): not part of a project
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDir(s, d); else await fs.copyFile(s, d);
  }
}

export async function createProject({ name, template = 'empty', device, board }) {
  const dir = projectDir(name);
  if (await exists(dir)) throw new HttpError(409, `project '${name}' already exists`);
  if (template && template !== 'empty') {
    // an example, else a test design (#1746)
    const ok = /^[a-z0-9_-]+$/i.test(template);
    const src = [EXAMPLES_DIR, TEST_DESIGNS_DIR].map(d => path.join(d, template)).find(d => ok && fsSync.existsSync(path.join(d, PROJECT_FILE)));
    if (!src) throw new HttpError(400, `unknown template '${template}'`);
    await copyDir(src, dir);
    const pj = await readProject(name);
    const was = `${pj.board}|${pj.device?.part}|${pj.device?.package}`;
    if (device) pj.device = device;
    if (board !== undefined) pj.board = board;
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
    top: '', simTop: '', files: [], constraints: `constraints/top${openOnlyDevice(device) ? '.pcf' : '.ucf'}`,
    stimuli: {}, impl: { optMode: 'Area', optLevel: 2, startupClk: 'JtagClk' },
  });
}

/** Writes a project's UCF from its board's pin table (ports matched by name: clk, led, sw, btn,
 *  seg, an…), as Update Constraints does in the interface. */
export async function boardConstraints(dir, pj) {
  const r = resolveBoard(pj.board, { part: pj.device?.part });
  if (!r || !pj.top) return;
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
  const text = boardConstraintsText({ device: r.device, ports, assignments, clocks, header: `UCF for top '${pj.top}' on ${r.board.name} (${r.device.part}${r.device.speed}-${r.device.package}), generated by Silinx` });
  // (the project's own paths, as every other: inside its folder, #479; its folder made, as a test design has none, #1746)
  const file = safeJoin(dir, pj.constraints || constraintsFile(r.device));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

export async function deleteProject(name) {
  const dir = projectDir(name);
  if (!await exists(dir)) throw new HttpError(404, 'not found');
  const trash = path.join(workspaceDir(), '.trash');
  await fs.mkdir(trash, { recursive: true });
  await fs.rename(dir, path.join(trash, `${name}-${Date.now()}`));
}

// project-relative path normalised to forward slashes, without './' or a trailing '/'
export const relKey = (dir, full) => path.relative(dir, full).split(path.sep).join('/');
// (whatever its case: on a case-insensitive file system SILINX.JSON is the same file)
const isProjectFile = key => key.toLowerCase() === PROJECT_FILE;

export async function readFile(name, rel) {
  const full = safeJoin(projectDir(name), rel);
  try { return await fs.readFile(full, 'utf8'); }
  catch { throw new HttpError(404, `file '${rel}' not found`); }
}

export async function writeFile(name, rel0, text) {
  const dir = projectDir(name);
  const full = safeJoin(dir, rel0);
  // the path as the project lists it (./src/a.vhd and src//a.vhd are src/a.vhd, #1229); silinx.json is the
  // project's description, written by the project's own routes (as the browser store refuses it)
  const rel = relKey(dir, full);
  if (!rel) throw new HttpError(400, 'missing path');
  if (isProjectFile(rel)) throw new HttpError(400, `${PROJECT_FILE} is the project's description`);
  await fs.mkdir(path.dirname(full), { recursive: true });
  // atomic: a reader (or a crash) never sees a half-written / empty file
  const tmp = path.join(path.dirname(full), `.${path.basename(full)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);   // hidden: not listed
  try {
    await fs.writeFile(tmp, text);
    await renameOver(tmp, full);
  } catch (e) { await fs.rm(tmp, { force: true }).catch(() => {}); throw e; }
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
export async function renameFile(name, from, to) {
  const dir = projectDir(name);
  const src = safeJoin(dir, from), dst = safeJoin(dir, to);
  if (src === dir || dst === dir) throw new HttpError(400, 'cannot rename the project folder itself');
  const fromKey = relKey(dir, src), toKey = relKey(dir, dst);
  if (isProjectFile(fromKey) || isProjectFile(toKey)) throw new HttpError(400, `${PROJECT_FILE} cannot be renamed`);
  return withProjectLock(name, async () => {
    let st;
    try { st = await fs.stat(src); } catch { throw new HttpError(404, `file '${from}' not found`); }
    const isDir = st.isDirectory();
    if (isDir && src !== dst && (dst + path.sep).startsWith(src + path.sep)) throw new HttpError(400, `cannot move '${from}' into itself`);
    if (src !== dst && await exists(dst) && src.toLowerCase() !== dst.toLowerCase()) throw new HttpError(409, `'${to}' already exists`);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.rename(src, dst);
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

/** Delete a project file or folder (recursively) and unregister the files it contained. */
export async function deleteFile(name, rel) {
  const dir = projectDir(name);
  const full = safeJoin(dir, rel);
  if (full === dir) throw new HttpError(400, 'cannot delete the project folder itself (delete the project instead)');
  const key = relKey(dir, full);
  if (isProjectFile(key)) throw new HttpError(400, `${PROJECT_FILE} cannot be deleted`);
  await withProjectLock(name, async () => {
    await fs.rm(full, { recursive: true, force: true });
    const pj = await readProject(name);
    const gone = p => p === key || p.startsWith(key + '/');
    const before = JSON.stringify(pj);
    pj.files = pj.files.filter(f => !gone(f.path));
    // the constraints file deleted: none (as the browser store does, #1230); nothing left to exclude there
    if (pj.constraints && gone(pj.constraints)) pj.constraints = null;
    if (pj.excluded) pj.excluded = pj.excluded.filter(p => !gone(p));
    if (JSON.stringify(pj) !== before) await writeProjectUnlocked(name, pj);
  });
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
