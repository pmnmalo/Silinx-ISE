// Project storage: one directory per project with an xailinx.json descriptor.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EXAMPLES_DIR = path.join(HERE, '..', 'examples');

export function workspaceDir() {
  return process.env.XAILINX_WORKSPACE || path.join(os.homedir(), 'XAIlinx-projects');
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function projectDir(name) {
  if (!NAME_RE.test(name || '')) throw new HttpError(400, `invalid project name '${name}'`);
  return path.join(workspaceDir(), name);
}

// Resolve a project-relative path, refusing anything that escapes the project folder.
export function safeJoin(dir, rel) {
  if (!rel || typeof rel !== 'string') throw new HttpError(400, 'missing path');
  const full = path.resolve(dir, rel);
  if (full !== dir && !full.startsWith(dir + path.sep)) throw new HttpError(400, 'path escapes project');
  return full;
}

export function langOf(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.v' || ext === '.vh' || ext === '.sv') return 'verilog';
  if (ext === '.vhd' || ext === '.vhdl') return 'vhdl';
  if (ext === '.ucf') return 'ucf';
  return 'text';
}

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

export async function listProjects() {
  const ws = workspaceDir();
  await fs.mkdir(ws, { recursive: true });
  const out = [];
  for (const ent of await fs.readdir(ws, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    try {
      const pj = JSON.parse(await fs.readFile(path.join(ws, ent.name, 'xailinx.json'), 'utf8'));
      out.push({ name: ent.name, device: pj.device, top: pj.top, board: pj.board });
    } catch { /* not a project */ }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readProject(name) {
  const dir = projectDir(name);
  let pj;
  try { pj = JSON.parse(await fs.readFile(path.join(dir, 'xailinx.json'), 'utf8')); }
  catch { throw new HttpError(404, `project '${name}' not found`); }
  pj.name = name;
  pj.files ||= [];
  return pj;
}

export async function writeProject(name, pj) {
  const dir = projectDir(name);
  const clean = { ...pj, name };
  delete clean.fileTree;
  await fs.writeFile(path.join(dir, 'xailinx.json'), JSON.stringify(clean, null, 2) + '\n');
  return clean;
}

async function walk(dir, base = '') {
  const out = [];
  for (const ent of await fs.readdir(path.join(dir, base), { withFileTypes: true })) {
    if (ent.name.startsWith('.') || (base === '' && ent.name === 'build')) continue;
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...await walk(dir, rel));
    else out.push(rel);
  }
  return out;
}

export async function fileTree(name) {
  return (await walk(projectDir(name))).filter(f => f !== 'xailinx.json').sort();
}

const DEFAULT_DEVICE = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' };

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const ent of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDir(s, d); else await fs.copyFile(s, d);
  }
}

export async function createProject({ name, template = 'empty', device, board }) {
  const dir = projectDir(name);
  if (await exists(dir)) throw new HttpError(409, `project '${name}' already exists`);
  if (template && template !== 'empty') {
    const src = path.join(EXAMPLES_DIR, template);
    if (!/^[a-z0-9_-]+$/i.test(template) || !await exists(path.join(src, 'xailinx.json')))
      throw new HttpError(400, `unknown template '${template}'`);
    await copyDir(src, dir);
    const pj = await readProject(name);
    if (device) pj.device = device;
    if (board !== undefined) pj.board = board;
    return writeProject(name, pj);
  }
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'sim'), { recursive: true });
  await fs.mkdir(path.join(dir, 'constraints'), { recursive: true });
  return writeProject(name, {
    name, version: 1, device: device || DEFAULT_DEVICE, board: board ?? null,
    top: '', simTop: '', files: [], constraints: 'constraints/top.ucf',
    stimuli: {}, impl: { optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' },
  });
}

export async function deleteProject(name) {
  const dir = projectDir(name);
  if (!await exists(dir)) throw new HttpError(404, 'not found');
  const trash = path.join(workspaceDir(), '.trash');
  await fs.mkdir(trash, { recursive: true });
  await fs.rename(dir, path.join(trash, `${name}-${Date.now()}`));
}

export async function readFile(name, rel) {
  const full = safeJoin(projectDir(name), rel);
  try { return await fs.readFile(full, 'utf8'); }
  catch { throw new HttpError(404, `file '${rel}' not found`); }
}

export async function writeFile(name, rel, text) {
  const dir = projectDir(name);
  const full = safeJoin(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, text);
  // Register HDL files automatically.
  const lang = langOf(rel);
  if (lang === 'verilog' || lang === 'vhdl') {
    const pj = await readProject(name);
    if (!pj.files.some(f => f.path === rel)) {
      const role = /^(sim|tb|test)\//.test(rel) || /(^|\/)tb_|_tb\.|_tb$/.test(rel) ? 'sim' : 'design';
      pj.files.push({ path: rel, lang, role });
      await writeProject(name, pj);
    }
  }
}

/** Move/rename a project file (or folder), keeping the project's file list and constraints path. */
export async function renameFile(name, from, to) {
  const dir = projectDir(name);
  const src = safeJoin(dir, from), dst = safeJoin(dir, to);
  if (!await exists(src)) throw new HttpError(404, `file '${from}' not found`);
  if (from !== to && await exists(dst) && from.toLowerCase() !== to.toLowerCase()) throw new HttpError(409, `'${to}' already exists`);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.rename(src, dst);
  const pj = await readProject(name);
  const lang = langOf(to);
  pj.files = pj.files.map(f => (f.path === from ? { ...f, path: to, lang: lang === 'vhdl' || lang === 'verilog' ? lang : f.lang } : f));
  if (pj.constraints === from) pj.constraints = to;
  return writeProject(name, pj);
}

export async function deleteFile(name, rel) {
  const dir = projectDir(name);
  await fs.rm(safeJoin(dir, rel), { force: true });
  const pj = await readProject(name);
  const n = pj.files.length;
  pj.files = pj.files.filter(f => f.path !== rel);
  if (pj.files.length !== n) await writeProject(name, pj);
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
