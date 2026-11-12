// A design opened from a link (#2826): a teacher's slide links to Silinx on a design, straight into Try it, the
// simulation or the board emulator. The link's options are in its hash (no server needed: the same fragment works on
// the Pages site and on a local server):
//   #design=<the project, inside the link>   its files (as a Silinx export's: silinx.json and every project file) as
//                                            JSON, deflate-raw compressed, base64url; the HDL a drawing makes again
//                                            left out (it is made again when the link is opened)
//   #open=<url of a .zip>                    a Silinx (or Xilinx ISE) project's zip hosted elsewhere (https, not
//                                            this computer nor a local network: #2829), fetched once the user agrees
//   #open=example:<name>                     one of the examples
//   &view=try|simulate|emulate               Try it (a schematic's, a state diagram's, a Petri net's or an ASM chart's: #2869, #3287, #3295),
//                                            the test bench's simulation, the board emulator
//   &top=<module>  &board=<board>            the module to open, the board to emulate
// A link comes from anywhere: everything here is untrusted input, sizes capped (the link, the design inflated, its
// files), paths checked again by the import (a design becomes a Silinx zip, imported as one).
// Isomorphic: the codec is the browser's CompressionStream (in Node too), or one given.
import { browserCodec, createZip } from './zip.js';
import { VIEW_RE, isCSource, viewHdl } from './view-hdl.js';
import { gateEntries, gateMessages } from './import-gate.js';
import { foldsToProjectFile, PROJECT_FILE } from './fold-name.js';
import { PROJECT_NAME_RE } from './project-name.js';

/** The limits of a link: the design's encoded length (characters), its JSON inflated (bytes), its files; `slides`:
 *  the length above which some slide tools cut a link (it is still made, with a warning). */
export const LINK_LIMITS = Object.freeze({ maxEncoded: 64000, maxInflated: 4 << 20, maxFiles: 400, slides: 2000 });
/** The views a link opens. */
export const LINK_VIEWS = Object.freeze(['try', 'simulate', 'emulate']);
const FORMAT = 1;
const NAME_RE = PROJECT_NAME_RE;   // (a project's: core/project-name.js, #3538)
export const MODULE_RE = /^[A-Za-z_][\w$]{0,127}$/;
export const BOARD_RE = /^[a-z0-9_-]{1,32}$/i;
const LAB_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;   // (a guided lab's id, core/labs.js)
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
// the tests' view of what is compiled (#3362: a link's HDL only once the import gate has passed it): compiled(paths)
export const LINK_TESTING = { compiled: null };
// the project's modules (the schematics' symbols) from its HDL files, as the editors read them
async function modulesOf(files) {
  const hdl = Object.entries(files).filter(([p]) => /\.(vhdl?|s?v)$/i.test(p))
    .map(([path, text]) => ({ path, text, lang: /\.s?v$/i.test(path) ? 'verilog' : 'vhdl' }));
  LINK_TESTING.compiled?.(hdl.map(h => h.path));
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
  if (design.length > LINK_LIMITS.maxEncoded) throw linkError(`the design is too large for a link (${design.length} characters, at most ${LINK_LIMITS.maxEncoded}): export it as a .zip (Export Project (.zip)…, Silinx) and link to that`);
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
  const raw = [{ path: 'silinx.json', data: JSON.stringify(payload.project, null, 2) },
    ...Object.entries(files).map(([path, data]) => ({ path, data })),
    ...bin.map(([path, b]) => { if (typeof b !== 'string') throw linkError(`the link's design: ${path} is not base64url`); return { path, data: fromB64url(b) }; })];
  // through the import gate (core/import-gate.js, #2830) before any parser or compiler reads a file (#3362): its sizes,
  // names, types and contents; a file it refuses is left out, said in the warnings
  const gate = list => { try { return gateEntries(list); } catch (e) { throw linkError(`the link's design: ${e.message}`); } };
  const g = gate(raw);
  const warnings = gateMessages(g);
  const kept = new Set(g.files.map(f => f.path));
  if (!kept.has('silinx.json')) throw linkError('the link\'s design is not a Silinx project');
  const texts = Object.fromEntries(Object.entries(files).filter(([p]) => kept.has(p)));
  // the HDL left out, made again from its drawing, from the files the gate passed (one that cannot be is a warning: the
  // drawing is there); then gated as well
  const madeEntries = [];
  const made_ = Array.isArray(payload.made) ? payload.made.filter(p => typeof p === 'string' && !(p in files)) : [];
  if (made_.length) {
    const mods = await modulesOf(texts);
    for (const target of made_) {
      const from = Object.keys(texts).find(p => VIEW_RE.test(p) && (() => { try { return JSON.parse(texts[p])?.generatedFile === target; } catch { return false; } })());
      const text = from ? made(from, texts[from], mods) : null;
      if (text === null) warnings.push(`${target}: not made again from ${from || 'its drawing'}`);
      else madeEntries.push({ path: target, data: text });
    }
  }
  const gm = gate(madeEntries);
  warnings.push(...gateMessages(gm));
  const madeKept = new Set(gm.files.map(f => f.path));
  // (silinx.json, the texts, the HDL made again, the binary files: the order of the link's files)
  const entries = [...raw.filter(e => kept.has(e.path) && typeof e.data === 'string'), ...madeEntries.filter(e => madeKept.has(e.path)),
    ...raw.filter(e => kept.has(e.path) && typeof e.data !== 'string')];
  const order = new Map(entries.map((e, i) => [e.path, i]));
  // (gated: the gate's result, what an importer takes: server/project-zip.js importProjectEntries)
  const gated = { gated: true, files: [...g.files, ...gm.files].sort((x, y) => order.get(x.path) - order.get(y.path)), refusals: [...g.refusals, ...gm.refusals], warnings: [...g.warnings, ...gm.warnings] };
  return { name, project: payload.project, entries, warnings, gated };
}

// a file's path inside the project: relative, forward slashes, no '..', no hidden part (.git, settings), not silinx.json
// nor a name a case-insensitive file system takes for it (SILINX.JSON, ſilinx.json; src/silinx.json is a file, #3034)
// (the import checks the paths again: project-store.js projectFromZip, server/project-zip.js)
function safePath(p) {
  const parts = p.split('/'), last = parts[parts.length - 1];
  return p.length > 0 && p.length <= 255 && !/[\\:\0-\x1f]/.test(p) && !foldsToProjectFile(p)
    && !(last !== PROJECT_FILE && foldsToProjectFile(last))
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

/** The drawings `view=try` opens (#2869): a schematic (its Try it), a state diagram, a Petri net or an ASM chart (its
 *  simulation, #2881). */
export const TRY_DRAWING = /\.(sch|fsm|pn|asm)\.json$/i;
/** The drawing of a module that `view=try` opens: its path in files ({ path: text }), or null. The drawing's name, or
 *  its generated HDL file's module, whatever its case (#2876: the HDL's VHDL names are in lower case, a drawing's as it
 *  was typed). */
export function tryDrawing(files, module) {
  const want = String(module).toLowerCase();
  return Object.keys(files).find(p => {
    if (!TRY_DRAWING.test(p)) return false;
    let m;
    try { m = JSON.parse(files[p]); } catch { return false; }
    if (String(m?.name ?? '').toLowerCase() === want) return true;
    const hdl = typeof m?.generatedFile === 'string' ? files[m.generatedFile] : null;
    return typeof hdl === 'string' && moduleNames({ [m.generatedFile]: hdl }).has(want);
  }) || null;
}

/**
 * Whether a design has what a link's view opens (null: it has; else the message): Try it a schematic's, a state
 * diagram's or a Petri net's (the module's drawn as one: top, else the project's top), the simulation a test bench (the project's), the emulator a board and a
 * top. files: { path: text } of the project's files (silinx.json's project given apart).
 */
export function viewProblem(project, files, { view, top } = {}) {
  const module = top || project?.top || '';
  if (top && !moduleNames(files).has(top.toLowerCase())) return `the design has no module '${top}'`;
  // a test bench's simulation, the other views the design's modules (#2878)
  const bench = top && benchNames(project, files).has(top.toLowerCase());
  if (view === 'simulate' && top && !bench) return `'${top}' is not a test bench of the design`;
  if (view !== 'simulate' && bench) return `'${top}' is a test bench: a link opens it in the simulation`;
  if (view === 'try') {
    if (!module) return 'Try it: the design has no top module (give top)';
    if (!tryDrawing(files, module)) return `Try it: '${module}' is not a schematic, a state diagram, a Petri net or an ASM chart`;
  }
  if (view === 'simulate' && !top && !project?.simTop) return 'the design has no test bench to simulate';
  if (view === 'emulate') {
    if (!project?.board) return 'the design has no board to emulate it on';
    if (!project?.top) return 'the design has no top module to emulate';
    // (the emulator's pins are the constraints', the top's ports: #2884)
    if (top && top.toLowerCase() !== String(project.top).toLowerCase()) return `the board emulator emulates the top module, '${project.top}', not '${top}'`;
  }
  return null;
}
/** The design's test benches (#2878): the modules of its files with the Simulation association (silinx.json's role
 *  'sim'), in lower case. */
export function benchNames(project, files) {
  const sim = Object.fromEntries((project?.files || []).filter(f => f?.role === 'sim' && typeof files[f.path] === 'string').map(f => [f.path, files[f.path]]));
  return moduleNames(sim);
}
// the modules a project's files define, in lower case (#2876): its HDL's entities and modules, its drawings' names, its
// C / C++ sources' (their top function's module, as the Design pane's, #2882)
function moduleNames(files) {
  const out = new Set();
  for (const [p, t] of Object.entries(files)) {
    if (/\.(vhdl?|s?v)$/i.test(p)) for (const m of String(t).matchAll(/^\s*(?:entity|module)\s+([A-Za-z_][\w$]*)/gim)) out.add(m[1].toLowerCase());
    else if (VIEW_RE.test(p)) { try { const n = JSON.parse(t)?.name; if (typeof n === 'string') out.add(n.toLowerCase()); } catch { /* not a drawing */ } }
    else if (isCSource(p)) { const m = cModule(p, t); if (m) out.add(m.toLowerCase()); }
  }
  return out;
}
// a C source's module (its top function's), or null (errors); made once per text (Copy Link… asks at every choice)
const C_MODULES = new Map();
function cModule(path, text) {
  const key = `${path}\0${text}`;
  if (!C_MODULES.has(key)) {
    let m = null;
    try { const r = viewHdl(path, String(text)); m = r && !r.errors.length ? r.module : null; } catch { /* not C */ }
    if (C_MODULES.size > 64) C_MODULES.clear();
    C_MODULES.set(key, m);
  }
  return C_MODULES.get(key);
}

/** The address of the Silinx site (its latest release), the base of a link made away from the app (the MCP server). */
export const SITE_URL = 'https://pmnmalo.github.io/Silinx/';

// ------------------------------------------------------------------ the link's hash
const KEYS = ['design', 'open', 'gist', 'view', 'top', 'board', 'ui', 'lab'];

/** A short link's `gist=` value (#3223, core/gist-link.js) checked -> { id, key }; or an Error (linkError). */
export function parseGistRef(value) {
  const [id, key, ...rest] = String(value ?? '').split('.');
  if (rest.length || !/^[0-9a-f]{20,40}$/.test(id || '') || !/^[A-Za-z0-9_-]{43}$/.test(key || '')) throw linkError('the link\'s gist= is not a short link\'s (<gist>.<key>)');
  return { id, key };
}

/**
 * The options of a link's hash ('#design=…&view=try'): null when it has none of them (the plain address, a token);
 * else { source: { kind: 'design', design } | { kind: 'example', name } | { kind: 'zip', url }, view, top, board, lab } (lab:
 * a guided lab opened once the project is, #3179).
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
  if ([opts.design, opts.open, opts.gist].filter(v => v !== undefined).length > 1) throw linkError(opts.gist === undefined ? 'the link has both design= and open=' : 'the link has more than one of design=, open= and gist=');
  if (opts.gist !== undefined) source = { kind: 'gist', ...parseGistRef(opts.gist) };
  else if (opts.design !== undefined) {
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
  } else throw linkError('the link names no design (design=, open= or gist=)');
  if (opts.view !== undefined && opts.view !== '' && !LINK_VIEWS.includes(opts.view)) throw linkError(`the link's view '${opts.view.slice(0, 32)}' is not one of ${LINK_VIEWS.join(', ')}`);
  if (opts.top && !MODULE_RE.test(opts.top)) throw linkError(`the link's top '${opts.top.slice(0, 64)}' is not a module name`);
  if (opts.board && !BOARD_RE.test(opts.board)) throw linkError(`the link's board '${opts.board.slice(0, 32)}' is not a board name`);
  if (opts.ui !== undefined && (opts.ui.length > UI_LIMITS.maxEncoded || !/^[A-Za-z0-9_-]+$/.test(opts.ui))) throw linkError('the link\'s view (ui=) is not one');
  if (opts.lab && !LAB_RE.test(opts.lab)) throw linkError(`the link's lab '${opts.lab.slice(0, 64)}' is not a lab's id`);
  return { source, view: opts.view || null, top: opts.top || null, board: opts.board || null, ...(opts.ui ? { ui: opts.ui } : {}), ...(opts.lab ? { lab: opts.lab } : {}) };
}

// a host of this computer or of a local network (a literal address, localhost, .local / .internal / .lan names):
// a link from anywhere does not make the browser fetch from them (#2829); the IPv6 forms that carry an IPv4 address
// (IPv4-compatible ::a.b.c.d, mapped, NAT64, 6to4, Teredo) and the reserved ranges too (#2962); a name with its trailing
// dots taken off, one with an empty label refused, and the names of a private network's own (.corp, a cluster's .svc)
// or that never resolve (.test, .invalid, .example: RFC 2606) refused too (#3415)
export function privateHost(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!h || h === 'localhost' || PRIVATE_NAME.test(h) || !h.includes('.') && !h.includes(':')) return true;
  if (!h.includes(':') && h.split('.').some(l => !l)) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) return privateV4(+v4[1], +v4[2], +v4[3]);
  if (h.includes(':')) {
    const g = ipv6Groups(h);
    if (!g) return true;   // not an address: refused
    const [a, b] = g;
    return a === 0                                            // ::/16: ::, ::1, IPv4-compatible, mapped (::ffff:0:0/96), translated
      || (a === 0x100 && !b && !g[2] && !g[3])                // 100::/64, discard only
      || (a === 0x64 && b === 0xff9b)                         // NAT64: 64:ff9b::/96, 64:ff9b:1::/48
      || (a & 0xfe00) === 0xfc00 || (a & 0xff80) === 0xfe80   // fc00::/7 unique local; fe80::/10 link-local, fec0::/10 site-local
      || (a & 0xff00) === 0xff00                              // ff00::/8 multicast
      || (a === 0x2001 && b === 0xdb8)                        // 2001:db8::/32 documentation
      || (a === 0x2001 && b === 0)                            // 2001::/32 Teredo: an IPv4 address inside (#3415)
      || (a === 0x2002 && privateV4(b >> 8, b & 0xff, g[2] >> 8));   // 6to4: the IPv4 address it carries
  }
  return false;
}

const PRIVATE_NAME = /\.(localhost|local|internal|lan|home|arpa|corp|intranet|private|localdomain|svc|test|invalid|example)$/;

// an IPv4 address of this computer, of a local network or of a reserved range (its first three bytes)
function privateV4(a, b, c) {
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))
    || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}

// an IPv6 address's eight 16-bit groups (an IPv4 address at its end as two of them); null: not an address
function ipv6Groups(h) {
  let s = h.replace(/%.*$/, '');
  const tail = /^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (tail) {
    const q = tail.slice(2).map(Number);
    if (q.some(n => n > 255)) return null;
    s = `${tail[1]}${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const part = x => (x ? x.split(':') : []);
  const [l, r] = [part(halves[0]), part(halves[1])];
  if ([...l, ...r].some(x => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  const zeros = 8 - l.length - r.length;
  if (halves.length === 1 ? zeros !== 0 : zeros < 1) return null;
  return [...l, ...Array(halves.length === 2 ? zeros : 0).fill('0'), ...r].map(x => parseInt(x, 16));
}

/**
 * A link: base (the app's address, its hash dropped) + the hash of { design | example | zip, view, top, board, ui, lab }.
 */
export function makeLink(base, { design, example, zip, gist, view, top, board, ui, lab } = {}) {
  const sources = [design, example, zip, gist].filter(v => v !== undefined && v !== null);
  if (sources.length !== 1) throw linkError('a link has one design: design, example, zip or gist');
  if (gist) parseGistRef(gist);
  if (view && !LINK_VIEWS.includes(view)) throw linkError(`view: one of ${LINK_VIEWS.join(', ')}`);
  if (top && !MODULE_RE.test(top)) throw linkError(`top: '${top}' is not a module name`);
  if (board && !BOARD_RE.test(board)) throw linkError(`board: '${board}' is not a board name`);
  if (example !== undefined && example !== null && !EXAMPLE_RE.test(example)) throw linkError(`example: '${example}' is not an example's name`);
  if (lab && !LAB_RE.test(lab)) throw linkError(`lab: '${lab}' is not a lab's id`);
  const parts = [design ? `design=${design}` : gist ? `gist=${gist}` : example ? `open=example:${example}` : `open=${encodeURI(zip).replace(/[#&]/g, encodeURIComponent)}`];
  if (top) parts.push(`top=${top}`);
  if (board) parts.push(`board=${board}`);
  if (view) parts.push(`view=${view}`);
  if (ui) parts.push(`ui=${ui}`);
  if (lab) parts.push(`lab=${lab}`);
  return `${String(base).replace(/#.*$/, '')}#${parts.join('&')}`;
}

// ------------------------------------------------------------------ the view in a link (#2886)
// The state of Silinx when the link was copied, as `ui=` (base64url JSON): { o: the open documents' reopen keys (web/js/
// view-state.js REOPEN), a: the one in front, b: the split's right side, p: the left page, v: the Design view, t: the
// Silinx interface's task, s / c / m: its side panel, messages, maximized }. Untrusted as the rest: only reopen keys of
// the known kinds naming paths inside the project and module names, known pages, views and tasks, booleans; capped.
export const UI_LIMITS = Object.freeze({ maxEncoded: 4000, maxOpen: 40 });
const PATH_KEY = /^(file|sch|asm|tt|ttsch|fsm|pn|chdl):(.+)$/;
const MODULE_KEY = /^(rtl|isim|emulator):([A-Za-z_][\w$]{0,127})(@\w{1,32})?$/;
const PAGES = ['design', 'files', 'libs'], DESIGN_VIEWS = ['sim', 'impl'], TASK_IDS = ['edit', 'sim', 'emu', 'impl'];
const reopenKeyOk = k => typeof k === 'string' && k.length <= 300 && (['summary', 'pins', 'impact'].includes(k)
  || (MODULE_KEY.test(k) && !(k.startsWith('rtl:') && k.includes('@')))
  || (PATH_KEY.test(k) && safePath(PATH_KEY.exec(k)[2])));

/** The view state ({ open, active, split, page, view } of view-state.js, and a layout { task, side, console, max } or
 *  null) as a link's `ui=`. */
export function encodeUi(view, layout = null) {
  const open = (view?.open || []).filter(reopenKeyOk).slice(0, UI_LIMITS.maxOpen);
  const st = { o: open };
  if (view?.active && open.includes(view.active)) st.a = view.active;
  const right = Array.isArray(view?.split?.b) ? view.split.b.filter(k => open.includes(k)) : null;
  if (right) st.b = right;
  if (PAGES.includes(view?.page)) st.p = view.page;
  if (DESIGN_VIEWS.includes(view?.view)) st.v = view.view;
  if (layout && TASK_IDS.includes(layout.task)) Object.assign(st, { t: layout.task, s: !!layout.side, c: !!layout.console, m: !!layout.max });
  return toB64url(enc.encode(JSON.stringify(st)));
}

/** A link's `ui=` read back: { view: { open, active, split, page, view }, layout: { task, side, console, max } | null,
 *  dropped: [what was left out, said in the console] }. Throws (error.linkError) when it is not one at all. */
export function decodeUi(text) {
  if (typeof text !== 'string' || !text || text.length > UI_LIMITS.maxEncoded) throw linkError('the link\'s view (ui=) is not one');
  let st;
  try { st = JSON.parse(dec.decode(fromB64url(text))); } catch { throw linkError('the link\'s view (ui=) does not decode'); }
  if (!st || typeof st !== 'object' || Array.isArray(st)) throw linkError('the link\'s view (ui=) is not one');
  const dropped = [];
  const raw = Array.isArray(st.o) ? st.o : [];
  const open = [];
  for (const k of raw.slice(0, UI_LIMITS.maxOpen)) (reopenKeyOk(k) ? open.push(k) : dropped.push(`a document '${String(k).slice(0, 80)}'`));
  if (raw.length > UI_LIMITS.maxOpen) dropped.push(`${raw.length - UI_LIMITS.maxOpen} document(s) over ${UI_LIMITS.maxOpen}`);
  const view = { open, active: open.includes(st.a) ? st.a : null, split: Array.isArray(st.b) ? { b: st.b.filter(k => open.includes(k)) } : null,
    page: PAGES.includes(st.p) ? st.p : null, view: DESIGN_VIEWS.includes(st.v) ? st.v : null };
  const layout = TASK_IDS.includes(st.t) ? { task: st.t, side: st.s === true, console: st.c === true, max: st.m === true } : null;
  const known = new Set(['o', 'a', 'b', 'p', 'v', 't', 's', 'c', 'm']);
  for (const k of Object.keys(st)) if (!known.has(k)) dropped.push(`'${k.slice(0, 32)}'`);
  return { view, layout, dropped };
}
