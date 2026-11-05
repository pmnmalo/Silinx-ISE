// The import gate (#2830): every file or project that comes from outside Silinx (a project's zip, an ISE project's
// .xise and its folder, a design link, a file added to a project, a drawing, a wave configuration, the MCP's import and
// write_file) passes through here before any parser or editor sees it. Isomorphic: no Node or DOM APIs, the same
// rules in the browser and on the server.
//
//   await gateZip(bytes, codec, { limits }) -> { files, refusals, warnings }   a zip, its caps checked while inflating
//   gateEntries([{ path, data }], { limits }) -> { files, refusals, warnings } entries already read (a folder, a link)
//   gateFile(path, data, { limits }) -> { path, data, kind, text }             one file, or a GateError with the reason
//   normalizePath(p) -> { path } | { reason }                                  a path of a project's file
//
// files: [{ path, data (Uint8Array), kind, text (a text kind's, decoded) }]; refusals: [{ path, reason }], the files
// left out (the import goes on without them); warnings: what was accepted with a change (invalid UTF-8 replaced);
// gated: true (the importers take only a gate's result: requireGated).
// What makes the whole import fail (a bomb: an archive, a decompressed total or a file count over the caps) throws a
// GateError, its message for the console. gateMessages(result) gives the lines the console and the MCP tools show.
//
// The rules:
// - sizes: the archive, the decompressed total, the file count, each file, a text's line length and its nesting
//   depth (brackets, XML elements, JSON; an HDL's if … elsif chain, #2577);
// - names: relative to the project, no '..', absolute path, drive letter, backslash, control character, character
//   Windows refuses (< > : " | ? *), hidden file or folder (.git, .silinx), reserved name (build/, CON, NUL, …),
//   symbolic link, or a name that differs from another only by its case;
// - XML (.xise, .sch, .sym, PNML, .wcfg, .svg): no DTD (<!DOCTYPE>, <!ENTITY>), so no external entity and no entity
//   expansion (XXE, billion laughs), whatever the parser that reads it next;
// - types: by the extension and the content: a text file (an HDL source, a drawing, constraints…) that holds a NUL
//   byte or is a web page is refused; text is decoded as UTF-8 (invalid sequences replaced, with a warning); any other
//   file (a document, an image, a script) is kept as it is, opaque: Silinx never renders it as a page nor runs it.

/** The caps of an import (bytes, counts). */
export const GATE_LIMITS = Object.freeze({
  maxArchive: 64 << 20,     // a zip (as core/zip.js ZIP_LIMITS.maxEntry, the upload the server holds)
  maxTotal: 256 << 20,      // every file once decompressed
  maxFiles: 5000,           // files in one import
  maxFile: 64 << 20,        // one file (an opaque one: a bitstream, an image)
  maxText: 16 << 20,        // one text file (a source, a drawing, a memory's data)
  maxLine: 1 << 20,         // one line of a source (HDL, C, constraints)
  maxDepth: 256,            // brackets, XML elements, JSON arrays and objects
  maxBranches: 1000,        // elsif / else if of one HDL file (#2577: a long chain overflows the simulators' stack)
  maxPath: 1024,            // a path
  maxSegment: 255,          // a file's or a folder's name
});

/** An import refused as a whole (its message is the console's). */
export class GateError extends Error {
  constructor(message, { path = null, reason = null } = {}) { super(message); this.name = 'GateError'; this.gate = true; this.path = path; this.reason = reason; }
}

const KINDS = [
  ['hdl', /\.(v|vh|vhd|vhdl|sv|svh)$/i],
  ['c', /\.(c|h|cc|cpp|cxx|hpp|hh)$/i],
  ['constraints', /\.(ucf|pcf|xdc|sdc)$/i],
  ['xml', /\.(xise|sch|sym|pnml|wcfg|xml|svg)$/i],
  ['json', /\.json$/i],
  ['data', /\.(mem|hex|coe|txt|dat|csv|md|vcd|do|tcl|ini|log)$/i],
];
const TEXT_KINDS = new Set(['hdl', 'c', 'constraints', 'xml', 'json', 'data']);
const LINE_KINDS = new Set(['hdl', 'c', 'constraints']);

/** The kind of a file by its name: hdl, c, constraints, xml, json, data (a text kind), or opaque. */
export function kindOf(path) {
  for (const [k, re] of KINDS) if (re.test(path)) return k;
  return 'opaque';
}

const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)(\..*)?$/i;

/** A path of a project's file made canonical ('./a//b' -> 'a/b'): { path }, or { reason } it is refused. */
export function normalizePath(p, { limits = GATE_LIMITS } = {}) {
  if (typeof p !== 'string' || !p) return { reason: 'no name' };
  if (p.length > limits.maxPath) return { reason: `path longer than ${limits.maxPath} characters` };
  // eslint-disable-next-line no-control-regex
  if (/[\0-\x1f\x7f]/.test(p)) return { reason: 'control character in the name' };
  if (/^[A-Za-z]:/.test(p)) return { reason: 'absolute path (a drive letter)' };
  if (p.includes('\\')) return { reason: 'backslash in the name' };
  if (p.startsWith('/')) return { reason: 'absolute path' };
  const parts = p.split('/').filter(s => s !== '' && s !== '.');
  if (!parts.length) return { reason: 'no name' };
  for (const s of parts) {
    if (s === '..') return { reason: "path leaves the project ('..')" };
    if (/[<>:"|?*]/.test(s)) return { reason: `character not allowed in a name (< > : " | ? *): '${s}'` };
    if (s.startsWith('.')) return { reason: `hidden file or folder ('${s}')` };
    if (/[ .]$/.test(s)) return { reason: `name ending with a space or a dot ('${s}')` };
    if (WINDOWS_DEVICE.test(s)) return { reason: `reserved name ('${s}')` };
    if (s.length > limits.maxSegment) return { reason: `name longer than ${limits.maxSegment} characters` };
  }
  if (parts[0].toLowerCase() === 'build') return { reason: "the project's build folder (build/) is Silinx's own" };
  return { path: parts.join('/') };
}

const enc = new TextEncoder();
const strict = new TextDecoder('utf-8', { fatal: true });
const loose = new TextDecoder('utf-8');
const toBytes = d => (typeof d === 'string' ? enc.encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));
const mb = n => (n < 1024 ? `${n} bytes` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${Math.round(n / 1048576 * 10) / 10} MB`);

// a text's longest line
function longestLine(text) {
  let max = 0, at = 0;
  for (;;) {
    const nl = text.indexOf('\n', at);
    const end = nl < 0 ? text.length : nl;
    if (end - at > max) max = end - at;
    if (nl < 0) return max;
    at = nl + 1;
  }
}

// the deepest nesting of brackets ( [ { outside strings and comments (HDL, C), or of a JSON's arrays and objects
function bracketDepth(text, json) {
  let d = 0, max = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { i++; while (i < text.length && text[i] !== '"' && text[i] !== '\n') { if (text[i] === '\\') i++; i++; } continue; }
    if (!json && ((c === '-' && text[i + 1] === '-') || (c === '/' && text[i + 1] === '/'))) { const nl = text.indexOf('\n', i); if (nl < 0) break; i = nl; continue; }
    if (!json && c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); if (e < 0) break; i = e + 1; continue; }
    if (c === '(' || c === '[' || c === '{') { if (++d > max) max = d; }
    else if (c === ')' || c === ']' || c === '}') d = Math.max(0, d - 1);
  }
  return max;
}

// the deepest nesting of an XML's elements (comments, CDATA, processing instructions and self-closing tags left out)
function xmlDepth(text) {
  let d = 0, max = 0;
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)[A-Za-z_][^>]*?(\/?)>/g;
  for (let m; (m = re.exec(text));) {
    if (m[1] === undefined) continue;
    if (m[1]) d = Math.max(0, d - 1);
    else if (!m[2] && ++d > max) max = d;
  }
  return max;
}

const WEB_PAGE = /^\s*(<!doctype\s+html|<html[\s>]|<script[\s>]|<body[\s>]|<iframe[\s>])/i;

// a text kind's content checked: null, or the reason it is refused
function textReason(kind, text, limits) {
  if (text.length > limits.maxText) return `text file larger than ${mb(limits.maxText)}`;
  if (text.includes('\0')) return 'binary content (a NUL byte) in a text file';
  if (WEB_PAGE.test(text.replace(/^﻿/, '').replace(/^<\?xml[^>]*\?>/, ''))) return 'a web page (HTML), not the file its name says';
  if (LINE_KINDS.has(kind)) {
    const line = longestLine(text);
    if (line > limits.maxLine) return `line longer than ${mb(limits.maxLine)}`;
  }
  if (kind === 'hdl' || kind === 'c') {
    if (bracketDepth(text, false) > limits.maxDepth) return `nesting deeper than ${limits.maxDepth} brackets`;
  }
  if (kind === 'hdl') {
    const branches = (text.match(/\belsif\b|\belse\s+if\b/gi) || []).length;
    if (branches > limits.maxBranches) return `more than ${limits.maxBranches} elsif / else if branches (#2577)`;
  }
  if (kind === 'json' && bracketDepth(text, true) > limits.maxDepth) return `JSON nested deeper than ${limits.maxDepth} levels`;
  if (kind === 'xml') {
    if (/<!DOCTYPE/i.test(text)) return 'XML with a DTD (<!DOCTYPE>): external entities and entity expansion are not accepted';
    if (/<!ENTITY/i.test(text)) return 'XML with an entity declaration (<!ENTITY>): not accepted';
    if (xmlDepth(text) > limits.maxDepth) return `XML nested deeper than ${limits.maxDepth} elements`;
  }
  return null;
}

// one entry checked: { file } or { reason }, and its warning (invalid UTF-8)
function screen(path, data, limits) {
  const bytes = toBytes(data);
  const kind = kindOf(path);
  if (bytes.length > limits.maxFile) return { reason: `file larger than ${mb(limits.maxFile)}` };
  if (!TEXT_KINDS.has(kind)) return { file: { path, data: bytes, kind } };
  let text, warning = null;
  try { text = strict.decode(bytes); } catch { text = loose.decode(bytes); warning = `${path}: not valid UTF-8 (the invalid bytes replaced)`; }
  text = text.replace(/^﻿/, '');
  const reason = textReason(kind, text, limits);
  return reason ? { reason } : { file: { path, data: bytes, kind, text }, warning };
}

// a batch's names: each normalised, a name that differs from an earlier one only by its case refused
function nameCheck(limits) {
  const seen = new Map();
  return (p, { symlink = false } = {}) => {
    if (symlink) return { reason: 'symbolic link' };
    const n = normalizePath(p, { limits });
    if (n.reason) return n;
    const key = n.path.toLowerCase();
    if (seen.has(key)) return { reason: seen.get(key) === n.path ? 'twice in the import' : `same name as '${seen.get(key)}' but for its case` };
    seen.set(key, n.path);
    return n;
  };
}

const merge = l => ({ ...GATE_LIMITS, ...(l || {}) });

/** Entries already read ([{ path, data }]: a folder, files picked, a design link's) through the gate. */
export function gateEntries(entries, { limits } = {}) {
  const L = merge(limits);
  if (entries.length > L.maxFiles) throw new GateError(`the import has too many files (${entries.length}, at most ${L.maxFiles})`);
  const total = entries.reduce((a, e) => a + (typeof e.data === 'string' ? e.data.length : e.data?.length ?? e.data?.byteLength ?? 0), 0);
  if (total > L.maxTotal) throw new GateError(`the import is larger than ${mb(L.maxTotal)} (${mb(total)})`);
  const name = nameCheck(L);
  const out = { files: [], refusals: [], warnings: [], gated: true };
  for (const e of entries) {
    const n = name(e.path, e);
    if (n.reason) { out.refusals.push({ path: String(e.path), reason: n.reason }); continue; }
    const s = screen(n.path, e.data ?? '', L);
    if (s.reason) out.refusals.push({ path: n.path, reason: s.reason });
    else { out.files.push(s.file); if (s.warning) out.warnings.push(s.warning); }
  }
  return out;
}

/** A zip through the gate: its size, entry count and decompressed total checked before and while inflating, each
 *  entry's name before it is inflated (a refused one never is), then each file as gateEntries does. */
export async function gateZip(bytes, codec, { limits } = {}) {
  const L = merge(limits);
  const b = toBytes(bytes);
  if (b.length > L.maxArchive) throw new GateError(`the zip is larger than ${mb(L.maxArchive)}, the most an import takes`);
  const { readZip } = await import('./zip.js');
  const name = nameCheck(L);
  const refusals = [], paths = new Map();
  let entries;
  try {
    entries = await readZip(b, codec, {
      maxEntry: L.maxFile, maxTotal: L.maxTotal, maxFiles: L.maxFiles,
      onEntry: ({ path, symlink }) => {
        const n = name(path, { symlink });
        if (n.reason) { refusals.push({ path, reason: n.reason }); return n.reason; }
        paths.set(path, n.path);
        return null;
      },
    });
  } catch (e) { throw new GateError(`cannot read zip: ${e.message}`); }
  const out = { files: [], refusals, warnings: [], gated: true };
  for (const e of entries) {
    const s = screen(paths.get(e.path) ?? e.path, e.data, L);
    if (s.reason) out.refusals.push({ path: e.path, reason: s.reason });
    else { out.files.push(s.file); if (s.warning) out.warnings.push(s.warning); }
  }
  return out;
}

/** One file through the gate (Add Source, a PNML net imported, the MCP's write_file): the file (its `warning`: invalid
 *  UTF-8 replaced), or a GateError naming it (`path`, `reason`). */
export function gateFile(path, data, { limits } = {}) {
  const L = merge(limits);
  const n = normalizePath(path, { limits: L });
  if (n.reason) throw new GateError(`${path}: ${n.reason}`, { path: String(path), reason: n.reason });
  const s = screen(n.path, data ?? '', L);
  if (s.reason) throw new GateError(`${n.path}: ${s.reason}`, { path: n.path, reason: s.reason });
  return s.warning ? { ...s.file, warning: s.warning } : s.file;
}

/** The console's lines of a gate's result (each a warning: 'WARNING: ' is the caller's); `quiet`: the paths the importer
 *  leaves out anyway, whose refusal is not said (an ISE project's own outputs). */
export const gateMessages = (r, { quiet = null } = {}) => [...r.refusals.filter(x => !quiet?.test(x.path)).map(x => `${x.path}: not imported: ${x.reason}`), ...r.warnings];

/** The entries of a gate's result (an importer's argument), or an error: entries that did not pass the gate. */
export function requireGated(r, who) {
  if (!r || r.gated !== true || !Array.isArray(r.files)) throw new Error(`${who}: the entries must pass the import gate (core/import-gate.js)`);
  return r.files;
}
