// The helpers of the MCP server's tools (server/mcp.js, #134): the errors, the projects' paths, the
// redaction of the ISE machine's address, the compilation and elaboration of a view, the boards.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';

// ------------------------------------------------------------------ helpers
export const toolError = (message) => Object.assign(new Error(message), { toolError: true });
export const MAX_TEXT = 20000;
export const clip = (text, max = MAX_TEXT) => (text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more characters)` : text);

// the ISE machine's address (ssh mode of Toolchain Settings) never in a result
let secrets = null;
export async function redactor() {
  if (!secrets) {
    secrets = [];
    try {
      const { loadConfig } = await import('./toolchain.js');
      const ssh = (await loadConfig()).ssh || {};
      if (ssh.user && ssh.host) secrets.push(`${ssh.user}@${ssh.host}`);
      if (ssh.host) secrets.push(ssh.host);
      if (process.env.SILINX_ISE_HOST && process.env.SILINX_ISE_HOST !== 'local') secrets.push(process.env.SILINX_ISE_HOST, process.env.SILINX_ISE_HOST.replace(/^.*@/, ''));
    } catch { /* no configuration */ }
    secrets = [...new Set(secrets.filter(s => s && s.length > 2))].sort((a, b) => b.length - a.length);
  }
  return text => secrets.reduce((t, s) => t.split(s).join('<ISE host>'), String(text));
}

// a file of a project: inside its folder, also once its symbolic links are followed
export async function projectPath(name, rel) {
  const dir = P.projectDir(name);
  const full = P.safeJoin(dir, rel);
  const root = await fsp.realpath(dir).catch(() => { throw toolError(`no project '${name}' in the workspace`); });
  // (the deepest part of the path that exists, resolved)
  let probe = full;
  while (!fs.existsSync(probe) && probe !== dir) probe = path.dirname(probe);
  const real = await fsp.realpath(probe);
  if (real !== root && !real.startsWith(root + path.sep)) throw toolError(`'${rel}' is outside the project '${name}'`);
  return full;
}

export async function readProject(name) {
  if (typeof name !== 'string' || !name) throw toolError('project: the name of a project of the workspace (list_projects)');
  try { return await P.readProject(name); } catch (e) { throw toolError(e.status === 404 || /not found|ENOENT/.test(e.message) ? `no project '${name}' in the workspace` : e.message); }
}

// the HDL of a view (the project's sources of that view and the HDL of its drawings), as the
// application's Check Syntax and simulation take it; sim: the simulation view
export async function viewSourcesOf(name, project, sim) {
  const { viewSources } = await import('./ise.js');
  const inView = role => (role === 'sim' ? sim : role === 'impl' ? !sim : true);
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role || 'design'));
  let drawn = [];
  try { drawn = (await viewSources(project, P.projectDir(name), hdl)).filter(v => v.text); } catch { /* none */ }
  return [...hdl, ...drawn.map(v => ({ path: v.path, lang: v.lang, text: v.text, role: 'design' }))];
}

export const diagLine = d => `${d.severity === 'error' ? 'ERROR' : d.severity === 'info' ? 'INFO' : 'WARNING'}:${d.tool || 'HDLCompiler'} - "${d.file}" Line ${d.line}: ${d.message}`;
export const diagJson = d => ({ severity: d.severity, file: d.file, line: d.line, col: d.col ?? null, tool: d.tool || 'HDLCompiler', message: d.message, ...(d.check ? { check: d.check } : {}) });

// compile and elaborate a view of a project: { lib, design, top, diags } (the design checks included)
export async function elaborateView(name, { top, sim = false } = {}) {
  const project = await readProject(name);
  const mod = top || (sim ? project.simTop : project.top);
  if (!mod) throw toolError(sim ? `the project '${name}' has no simulation top (a test bench): give top` : `the project '${name}' has no top module: give top`);
  const { compile, elaborate } = await import('../core/compile.js');
  const { primitiveSources } = await import('../core/unisim.js');
  const { designChecks } = await import('../core/lint.js');
  const srcs = await viewSourcesOf(name, project, sim);
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  let design = null, extra = [];
  try { design = elaborate(lib, mod); } catch (e) { extra = [{ severity: 'error', file: srcs[0]?.path || '', line: 1, col: 1, message: e.message }]; }
  if (design) { try { extra = designChecks(lib, design, { lint: true }); } catch { /* no checks */ } }
  // (an HDL file its drawing cannot make again, #303: an error of the file, the drawing's errors in it, as Check Syntax's)
  const { staleDrawings } = await import('./drawing-sync.js');
  const inView = new Set(srcs.map(s => s.path));
  const stale = (await staleDrawings(P, name)).filter(s => inView.has(s.target)).map(({ target, from, why }) => ({ severity: 'error', file: target, line: 1, col: 1, tool: 'Silinx',
    message: `${target} is not up to date: ${from} cannot generate it, ${why}. Fix ${from} (its HDL is then generated again).` }));
  const seen = new Set();
  const diags = [...lib.errors, ...(design?.diags || []), ...extra, ...stale]
    .filter(d => { const k = `${d.file}:${d.line}:${d.message}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(d => ({ ...d, tool: d.tool || 'HDLCompiler' }));
  return { project, srcs, lib, design, top: mod, diags };
}

export const STR = (description) => ({ type: 'string', description });
export const PROJECT = STR('The project\'s name in the Silinx workspace (list_projects).');
export const deviceName = d => (d ? `${d.part}${d.package}${d.speed}` : 'no device');

// a board (basys2, nexys2) and its variant: { board, device } for a new project
export async function boardDevice(board, variant) {
  const { resolveBoard } = await import('./devices.js');
  const r = resolveBoard(board, { variant });
  if (!r) throw toolError(`unknown board '${board}' (basys2, nexys2)`);
  if (variant && r.variant?.id !== variant) throw toolError(`the ${r.board.name} has no variant '${variant}'`);
  return { board: r.board.id, device: { family: 'spartan3e', part: r.device.part, package: r.device.package, speed: r.device.speed } };
}
