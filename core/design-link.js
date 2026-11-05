// A design opened from a link (#2826): a teacher's slide links to Silinx on a design, straight into Try it, the
// simulation or the board emulator. The link's options are in its hash (no server needed: the same fragment works on
// the Pages site and on a local server):
//   #design=<the project, inside the link>   its files (as a Silinx export's: silinx.json and every project file) as
//                                            JSON, deflate-raw compressed, base64url; the HDL a drawing makes again
//                                            left out (it is made again when the link is opened)
//   #open=<url of a .zip>                    a Silinx (or Xilinx ISE) project's zip hosted elsewhere (https, not
//                                            this computer nor a local network: #2829), fetched once the user agrees
//   #open=example:<name>                     one of the examples
//   &view=try|simulate|emulate               Try it (a schematic's; a state diagram's or a Petri net's Simulate, #2869),
//                                            the test bench's simulation, the board emulator
//   &top=<module>  &board=<board>            the module to open, the board to emulate
// A link comes from anywhere: everything here is untrusted input, sizes capped (the link, the design inflated, its
// files), paths checked again by the import (a design becomes a Silinx zip, imported as one).
// Isomorphic: the codec is the browser's CompressionStream (in Node too), or one given.
import { browserCodec, createZip } from './zip.js';
import { VIEW_RE, viewHdl } from './view-hdl.js';
import { gateEntries, gateMessages } from './import-gate.js';

/** The limits of a link: the design's encoded length (characters), its JSON inflated (bytes), its files; `slides`:
 *  the length above which some slide tools cut a link (it is still made, with a warning). */
export const LINK_LIMITS = Object.freeze({ maxEncoded: 64000, maxInflated: 4 << 20, maxFiles: 400, slides: 2000 });
/** The views a link opens. */
export const LINK_VIEWS = Object.freeze(['try', 'simulate', 'emulate']);
const FORMAT = 1;
const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;   // (a project's: server/projects.js, web/js/project-store.js)
const MODULE_RE = /^[A-Za-z_][\w$]{0,127}$/;
const BOARD_RE = /^[a-z0-9_-]{1,32}$/i;
const EXAMPLE_RE = /^[a-z0-9_-]{1,64}$/i;

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const linkError = msg => Object.assign(new Error(msg), { linkError: true });

// ------------------------------------------------------------------ base64url
function toB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw linkError('the design in the link is not base64url');
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ------------------------------------------------------------------ the HDL a drawing makes again
// the HDL files of the project's drawings that the drawing makes again exactly as they are, from the other files
// (a schematic's symbols from the project's HDL): { hdlPath: drawingPath }
async function regenerable(files) {
  const out = {};
  const drawings = Object.keys(files).filter(p => VIEW_RE.test(p));
  if (!drawings.length) return out;
  const mods = await modulesOf(files);
  for (const p of drawings) {
    let m;
    try { m = JSON.parse(files[p]); } catch { continue; }
    const target = m?.generatedFile;
    if (!m || typeof m !== 'object' || m.base === 'hdl' || typeof target !== 'string' || typeof files[target] !== 'string') continue;
    if (made(p, files[p], mods) === files[target]) out[target] = p;
  }
  return out;
}
function made(path, text, mods) {
  try {
    const r = viewHdl(path, text, { modules: /\.sch\.json$/i.test(path) ? mods : {}, linked: () => false });
    return r && !r.errors.length ? r.text : null;
  } catch { return null; }
}
// the project's modules (the schematics' symbols) from its HDL files, as the editors read them
async function modulesOf(files) {
  const hdl = Object.entries(files).filter(([p]) => /\.(vhdl?|s?v)$/i.test(p))
    .map(([path, text]) => ({ path, text, lang: /\.s?v$/i.test(path) ? 'verilog' : 'vhdl' }));
  try {
    const [{ compile }, { modulesFromLibrary }] = await Promise.all([import('./compile.js'), import('./schdoc.js')]);
    return modulesFromLibrary(compile(hdl), { sources: Object.fromEntries(hdl.map(s => [s.path, s.text])) });
  } catch { return {}; }
}

// ------------------------------------------------------------------ a design in a link
/**
 * A project's files ([{ path, data }], as a Silinx export's zip: silinx.json and every file) as the `design=` of a
 * link: { design (base64url), length, name, left: [HDL files left out, made again from their drawing] }.
 * A file that is not text (UTF-8) goes as base64. Throws when the design is too large for a link.
 */
export async function encodeDesign(entries, { codec = browserCodec() } = {}) {
  const files = {}, bin = {};
  let project = null;
  for (const e of entries) {
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    if (e.path === 'silinx.json') { project = JSON.parse(dec.decode(data)); continue; }
    try { files[e.path] = dec.decode(data); } catch { bin[e.path] = toB64url(data); }
  }
  if (!project || typeof project !== 'object') throw linkError('not a Silinx project: no silinx.json');
  const gen = await regenerable(files);
  for (const p of Object.keys(gen)) delete files[p];
  const payload = { v: FORMAT, project, files, ...(Object.keys(bin).length ? { bin } : {}), ...(Object.keys(gen).length ? { made: Object.keys(gen) } : {}) };
  const design = toB64url(new Uint8Array(await codec.deflate(enc.encode(JSON.stringify(payload)))));
  if (design.length > LINK_LIMITS.maxEncoded) throw linkError(`the design is too large for a link (${design.length} characters, at most ${LINK_LIMITS.maxEncoded}): export it as a .zip (Export Silinx ISE Project) and link to that`);
  return { design, length: design.length, name: project.name, left: Object.keys(gen) };
}

/**
 * The `design=` of a link as the project's files: { name, project, entries: [{ path, data }] (silinx.json first, the
 * HDL left out made again from its drawing), warnings }. Throws (error.linkError) on a link that does not decode.
 */
export async function decodeDesign(design, { codec = browserCodec() } = {}) {
  if (typeof design !== 'string' || !design) throw linkError('the link has no design');
  if (design.length > LINK_LIMITS.maxEncoded) throw linkError(`the design in the link is too long (${design.length} characters, at most ${LINK_LIMITS.maxEncoded})`);
  let payload;
  try {
    const json = await codec.inflate(fromB64url(design), LINK_LIMITS.maxInflated);
    if (json.length > LINK_LIMITS.maxInflated) throw new Error('too large');
    payload = JSON.parse(dec.decode(json));
  } catch (e) { throw e.linkError ? e : linkError(`the design in the link does not decode (${e.message})`); }
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  if (!obj(payload) || payload.v !== FORMAT || !obj(payload.project) || !obj(payload.files) || (payload.bin !== undefined && !obj(payload.bin))) throw linkError('the link\'s design is not a Silinx project');
  const name = String(payload.project.name ?? '');
  if (!NAME_RE.test(name)) throw linkError(`the link's design has no valid project name ('${name.slice(0, 64)}')`);
  const files = {};
  const all = [...Object.keys(payload.files), ...Object.keys(payload.bin || {})];
  if (all.length > LINK_LIMITS.maxFiles) throw linkError(`the link's design has more than ${LINK_LIMITS.maxFiles} files`);
  for (const p of all) if (!safePath(p)) throw linkError(`the link's design has a file outside the project ('${p.slice(0, 120)}')`);
  for (const [p, t] of Object.entries(payload.files)) {
    if (typeof t !== 'string') throw linkError(`the link's design: ${p} is not a text`);
    files[p] = t;
  }
  const bin = Object.entries(payload.bin || {});
  // the HDL left out, made again from its drawing (one that cannot be is a warning: the drawing is there)
  const warnings = [];
  const made_ = Array.isArray(payload.made) ? payload.made.filter(p => typeof p === 'string' && !(p in files)) : [];
  if (made_.length) {
    const mods = await modulesOf(files);
    for (const target of made_) {
      const from = Object.keys(files).find(p => VIEW_RE.test(p) && (() => { try { return JSON.parse(files[p])?.generatedFile === target; } catch { return false; } })());
      const text = from ? made(from, files[from], mods) : null;
      if (text === null) warnings.push(`${target}: not made again from ${from || 'its drawing'}`);
      else files[target] = text;
    }
  }
  const raw = [{ path: 'silinx.json', data: JSON.stringify(payload.project, null, 2) },
    ...Object.entries(files).map(([path, data]) => ({ path, data })),
    ...bin.map(([path, b]) => { if (typeof b !== 'string') throw linkError(`the link's design: ${path} is not base64url`); return { path, data: fromB64url(b) }; })];
  // through the import gate (core/import-gate.js, #2830): its sizes, names, types and contents; a file it refuses is
  // left out, said in the warnings
  let g;
  try { g = gateEntries(raw); } catch (e) { throw linkError(`the link's design: ${e.message}`); }
  warnings.push(...gateMessages(g));
  const kept = new Set(g.files.map(f => f.path));
  const entries = raw.filter(e => kept.has(e.path));
  if (!kept.has('silinx.json')) throw linkError('the link\'s design is not a Silinx project');
  // (gated: the gate's result, what an importer takes: server/project-zip.js importProjectEntries)
  return { name, project: payload.project, entries, warnings, gated: g };
}

// a file's path inside the project: relative, forward slashes, no '..', no hidden part (.git, settings), not silinx.json
// (the import checks the paths again: project-store.js projectFromZip, server/project-zip.js)
function safePath(p) {
  const parts = p.split('/');
  return p.length > 0 && p.length <= 255 && !/[\\:\0-\x1f]/.test(p) && p.toLowerCase() !== 'silinx.json'
    && parts.every(s => s && s !== '..' && !s.startsWith('.'));
}

/** The project's files of a link's design as a Silinx export's zip (bytes), for the import of a zip. */
export async function designZip(entries, { codec = browserCodec() } = {}) {
  return createZip(entries, codec);
}

/** A project's name with the first free suffix: ALU -> ALU_2, ALU_3, … (#2875: the link's design beside the student's
 *  project), within a project name's 64 characters; taken: the workspace's names (their case ignored). */
export function freeName(name, taken) {
  const have = new Set(taken.map(n => n.toLowerCase()));
  for (let n = 2; ; n++) {
    const tail = `_${n}`, cand = name.slice(0, 64 - tail.length) + tail;
    if (!have.has(cand.toLowerCase())) return cand;
  }
}

/** Whether two projects' files are the same ({ path: text }), silinx.json left out (opening a project rewrites it). */
export function sameFiles(a, b) {
  const keys = o => Object.keys(o).filter(k => k !== 'silinx.json').sort();
  const ka = keys(a), kb = keys(b);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

/** The drawings `view=try` opens (#2869): a schematic (its Try it), a state diagram or a Petri net (its Simulate). */
export const TRY_DRAWING = /\.(sch|fsm|pn)\.json$/i;
/** The drawing of a module that `view=try` opens: its path in files ({ path: text }), or null. */
export function tryDrawing(files, module) {
  return Object.keys(files).find(p => TRY_DRAWING.test(p) && (() => { try { return JSON.parse(files[p])?.name === module; } catch { return false; } })()) || null;
}

/**
 * Whether a design has what a link's view opens (null: it has; else the message): Try it a schematic's, a state
 * diagram's or a Petri net's (the module's drawn as one: top, else the project's top), the simulation a test bench (the project's), the emulator a board and a
 * top. files: { path: text } of the project's files (silinx.json's project given apart).
 */
export function viewProblem(project, files, { view, top } = {}) {
  const module = top || project?.top || '';
  if (top && !moduleNames(files).has(top)) return `the design has no module '${top}'`;
  if (view === 'try') {
    if (!module) return 'Try it: the design has no top module (give top)';
    if (!tryDrawing(files, module)) return `Try it: '${module}' is not a schematic, a state diagram or a Petri net`;
  }
  if (view === 'simulate' && !project?.simTop) return 'the design has no test bench to simulate';
  if (view === 'emulate') {
    if (!project?.board) return 'the design has no board to emulate it on';
    if (!module) return 'the design has no top module to emulate';
  }
  return null;
}
// the modules a project's files define: its HDL's entities and modules, its drawings' names
function moduleNames(files) {
  const out = new Set();
  for (const [p, t] of Object.entries(files)) {
    if (/\.(vhdl?|s?v)$/i.test(p)) for (const m of String(t).matchAll(/^\s*(?:entity|module)\s+([A-Za-z_][\w$]*)/gim)) out.add(m[1]);
    else if (VIEW_RE.test(p)) { try { const n = JSON.parse(t)?.name; if (typeof n === 'string') out.add(n); } catch { /* not a drawing */ } }
  }
  return out;
}

/** The address of the Silinx site (its latest release), the base of a link made away from the app (the MCP server). */
export const SITE_URL = 'https://pmnmalo.github.io/Silinx-ISE/';

// ------------------------------------------------------------------ the link's hash
const KEYS = ['design', 'open', 'view', 'top', 'board'];

/**
 * The options of a link's hash ('#design=…&view=try'): null when it has none of them (the plain address, a token);
 * else { source: { kind: 'design', design } | { kind: 'example', name } | { kind: 'zip', url }, view, top, board }.
 * Throws (error.linkError) on a broken one.
 */
export function parseLink(hash) {
  const text = String(hash ?? '').replace(/^#/, '');
  if (text.length > LINK_LIMITS.maxEncoded + 1024) throw linkError('the link is too long');
  const opts = {};
  for (const part of text.split('&')) {
    const i = part.indexOf('=');
    const key = i < 0 ? part : part.slice(0, i);
    if (!KEYS.includes(key)) continue;
    let value;
    try { value = decodeURIComponent(i < 0 ? '' : part.slice(i + 1)); } catch { throw linkError(`the link's ${key} is not well encoded`); }
    if (key in opts) throw linkError(`the link has two ${key}=`);
    opts[key] = value;
  }
  if (!Object.keys(opts).length) return null;
  let source;
  if (opts.design !== undefined && opts.open !== undefined) throw linkError('the link has both design= and open=');
  if (opts.design !== undefined) {
    if (!opts.design) throw linkError('the link\'s design= is empty');
    source = { kind: 'design', design: opts.design };
  } else if (opts.open !== undefined) {
    const ex = /^example:(.*)$/.exec(opts.open);
    if (ex) {
      if (!EXAMPLE_RE.test(ex[1])) throw linkError(`the link names no example ('${ex[1].slice(0, 64)}')`);
      source = { kind: 'example', name: ex[1] };
    } else {
      let url;
      try { url = new URL(opts.open); } catch { throw linkError(`the link's open= is not an address ('${opts.open.slice(0, 120)}')`); }
      if (url.protocol !== 'https:') throw linkError(`the link's open= is not an https address ('${opts.open.slice(0, 120)}')`);
      if (url.username || url.password) throw linkError('the link\'s open= carries a user name or password');
      if (privateHost(url.hostname)) throw linkError(`the link's open= is an address of this computer or of a local network ('${url.hostname.slice(0, 64)}')`);
      source = { kind: 'zip', url: url.href };
    }
  } else throw linkError('the link names no design (design= or open=)');
  if (opts.view !== undefined && opts.view !== '' && !LINK_VIEWS.includes(opts.view)) throw linkError(`the link's view '${opts.view.slice(0, 32)}' is not one of ${LINK_VIEWS.join(', ')}`);
  if (opts.top && !MODULE_RE.test(opts.top)) throw linkError(`the link's top '${opts.top.slice(0, 64)}' is not a module name`);
  if (opts.board && !BOARD_RE.test(opts.board)) throw linkError(`the link's board '${opts.board.slice(0, 32)}' is not a board name`);
  return { source, view: opts.view || null, top: opts.top || null, board: opts.board || null };
}

// a host of this computer or of a local network (a literal address, localhost, .local / .internal / .lan names):
// a link from anywhere does not make the browser fetch from them (#2829)
export function privateHost(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h || h === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(h) || !h.includes('.') && !h.includes(':')) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [+v4[1], +v4[2]];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(':')) return h === '::' || h === '::1' || /^(fc|fd|fe[89ab])/.test(h) || /^::ffff:/.test(h);
  return false;
}

/**
 * A link: base (the app's address, its hash dropped) + the hash of { design | example | zip, view, top, board }.
 */
export function makeLink(base, { design, example, zip, view, top, board } = {}) {
  const sources = [design, example, zip].filter(v => v !== undefined && v !== null);
  if (sources.length !== 1) throw linkError('a link has one design: design, example or zip');
  if (view && !LINK_VIEWS.includes(view)) throw linkError(`view: one of ${LINK_VIEWS.join(', ')}`);
  if (top && !MODULE_RE.test(top)) throw linkError(`top: '${top}' is not a module name`);
  if (board && !BOARD_RE.test(board)) throw linkError(`board: '${board}' is not a board name`);
  if (example !== undefined && example !== null && !EXAMPLE_RE.test(example)) throw linkError(`example: '${example}' is not an example's name`);
  const parts = [design ? `design=${design}` : example ? `open=example:${example}` : `open=${encodeURI(zip).replace(/[#&]/g, encodeURIComponent)}`];
  if (top) parts.push(`top=${top}`);
  if (board) parts.push(`board=${board}`);
  if (view) parts.push(`view=${view}`);
  return `${String(base).replace(/#.*$/, '')}#${parts.join('&')}`;
}
