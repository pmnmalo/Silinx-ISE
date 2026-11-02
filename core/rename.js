// Rename a module/entity in HDL sources: only the places that name the design unit are changed
// (its declaration and end, `architecture … of X`, components, `entity work.X`, instances), never
// other identifiers that happen to have the same name. Any other name of a source (F2 in the
// editor): renameSymbol, below.
//
// Isomorphic module (browser + Node).

import { lex } from './vhdl/lexer.js';
import { tokenize } from './verilog/lexer.js';
import { analyze } from './scopes.js';
import { VHDL_WORDS, VERILOG_WORDS, SV_WORDS } from './reserved.js';
import { lineStarts } from './util.js';

/** Offsets of each line start, to turn token line/col (1-based) into string offsets. */

/** Replace the tokens at `hits` ([{line, col, len}]) by `name`. */
function splice(text, hits, name) {
  if (!hits.length) return text;
  const ls = lineStarts(text);
  const offs = hits.map(h => ({ at: ls[h.line - 1] + h.col - 1, len: h.len })).sort((a, b) => b.at - a.at);
  let out = text;
  for (const o of offs) out = out.slice(0, o.at) + name + out.slice(o.at + o.len);
  return out;
}

function vhdlHits(text, oldName) {
  const { tokens } = lex(text);
  const T = tokens.filter(t => t.type !== 'comment');
  const isKw = (t, ...v) => t && t.type === 'kw' && v.includes(String(t.value).toLowerCase());
  const isOp = (t, v) => t && t.type === 'op' && t.value === v;
  const target = oldName.toLowerCase();
  const hits = [];
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t.type !== 'id' || String(t.value).toLowerCase() !== target) continue;
    const p1 = T[i - 1], p2 = T[i - 2], p3 = T[i - 3], n1 = T[i + 1];
    const ok =
      isKw(p1, 'entity', 'component', 'configuration') ||                      // entity X is / component X / …
      (isKw(p1, 'end') ) ||                                                    // end X;
      (isKw(p1, 'entity', 'component') && isKw(p2, 'end')) ||                  // end entity X / end component X
      (isKw(p1, 'of') && p2?.type === 'id' && isKw(p3, 'architecture', 'configuration')) ||
      (isOp(p1, '.') && p2?.type === 'id' && isKw(p3, 'entity')) ||            // entity work.X
      (isOp(p1, ':') && (isKw(n1, 'port', 'generic')));                      // u1 : X port map
    // `end X` must close the entity/component itself, not an architecture or a process with that label
    if (ok && isKw(p1, 'end') && !isKw(p2, 'entity', 'component')) {
      // accept only when an `entity X` / `component X` declaration with this name precedes it
      let j = i - 2, depth = 0, found = false;
      for (; j >= 0; j--) {
        if (isKw(T[j], 'end')) depth++;
        if ((isKw(T[j], 'entity', 'component')) && T[j + 1]?.type === 'id' && String(T[j + 1].value).toLowerCase() === target && !isKw(T[j - 1], 'end') && !isOp(T[j + 1], '.')) { found = true; break; }
        if (isKw(T[j], 'architecture', 'package', 'process', 'function', 'procedure')) break;
      }
      if (!found) continue;
    }
    if (ok) hits.push({ line: t.line, col: t.col, len: String(t.raw ?? t.value).length });
  }
  return hits;
}

function verilogHits(text, oldName) {
  const { tokens: T } = tokenize(text, 'rename', []);
  const isKw = (t, v) => t && t.t === 'kw' && t.v === v;
  const isOp = (t, v) => t && t.t === 'op' && t.v === v;
  const hits = [];
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t.t !== 'id' || t.v !== oldName) continue;
    const p1 = T[i - 1], n1 = T[i + 1], n2 = T[i + 2];
    const decl = isKw(p1, 'module') || isKw(p1, 'macromodule') || (isOp(p1, ':') && isKw(T[i - 2], 'endmodule'));
    // instance: X #( … ) u ( … )   or   X u ( … )   or   X u [N:0] ( … ), at the start of an item
    const itemStart = !p1 || isOp(p1, ';') || isKw(p1, 'endmodule') || isKw(p1, 'begin') || isKw(p1, 'end') || isKw(p1, 'generate') || isKw(p1, 'else') || isOp(p1, ')');
    const inst = itemStart && (isOp(n1, '#') || (n1?.t === 'id' && (isOp(n2, '(') || isOp(n2, '['))));
    if (decl || inst) hits.push({ line: t.line, col: t.col, len: t.v.length });
  }
  return hits;
}

/**
 * Rename module/entity `oldName` to `newName` in one HDL source.
 * @returns {string} the new text (the same string when nothing refers to the module)
 */
export function renameModuleInSource(text, lang, oldName, newName) {
  if (!text || !oldName || oldName === newName) return text;
  const hits = lang === 'verilog' ? verilogHits(text, oldName) : vhdlHits(text, oldName);
  return splice(text, hits, newName);
}

/** Rename the module in a schematic document (.sch.json): module symbols and the sheet name. */
export function renameModuleInSchematic(doc, oldName, newName, { linked = false } = {}) {
  let changed = false;
  const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  for (const s of doc.symbols || []) {
    if (s.type === 'module' && eq(s.params?.module, oldName)) { s.params.module = newName; changed = true; }
  }
  if (linked && eq(doc.name, oldName)) { doc.name = newName; changed = true; }
  return changed;
}

// ------------------------------------------------------------------ rename a symbol (F2)
// Every occurrence of the object named at a position (a signal, port, variable, constant, type,
// label, generic / parameter, instance, function…) is renamed in the file, through the scopes of
// core/scopes.js: not in comments or strings, not another object with the same name in another
// scope. VHDL is not case-sensitive (every spelling of the old name is renamed; the new one is
// written as typed), Verilog is. A rename that would make a name mean another object (the new
// name already declared there, or hiding / hidden by another declaration) is refused.

const VHDL_NAME = /^[A-Za-z](?:_?[A-Za-z0-9])*$/;
const VLOG_NAME = /^[A-Za-z_][A-Za-z0-9_$]*$/;

const KIND_WORD = { entity: 'entity', architecture: 'architecture', package: 'package', configuration: 'configuration', component: 'component',
  module: 'module', port: 'port', generic: 'generic', parameter: 'parameter', signal: 'signal', variable: 'variable', constant: 'constant',
  file: 'file', alias: 'alias', type: 'type', subtype: 'subtype', enum: 'literal', field: 'field', attribute: 'attribute',
  argument: 'argument', function: 'function', procedure: 'procedure', task: 'task', label: 'label', instance: 'instance', loopvar: 'loop variable', genvar: 'genvar' };
/** A word for the kind of a symbol ('signal', 'port', 'label'…). */
export const kindWord = sym => KIND_WORD[sym?.kind] || 'name';

/** The symbol named at a 1-based line / column: { sym, occ, a } or { error }. */
export function symbolAt(text, lang, line, col) {
  const a = analyze(text, lang);
  const occ = a.occAtPos(line, col);
  if (!occ) return { error: 'There is no name to rename here.', a };
  if (!occ.sym) {
    if (occ.ext) return { error: `'${occ.name}' is a port of '${occ.ext.unit}', declared in another file: rename it there.`, a, occ };
    return { error: `'${occ.name}' is not declared in this file: rename it where it is declared.`, a, occ };
  }
  return { sym: occ.sym, occ, a };
}

/** Why `name` cannot be a new name in this language (a message), or null. */
export function badName(name, lang) {
  if (lang === 'verilog') {
    if (!VLOG_NAME.test(name)) return `'${name}' is not a valid Verilog name: a letter or _ first, then letters, digits, _ or $.`;
    // (the shared lists, core/reserved.js, #679: SystemVerilog's words are not good names either)
    if (VERILOG_WORDS.has(name) || SV_WORDS.has(name)) return `'${name}' is a reserved word of Verilog.`;
  } else {
    if (!VHDL_NAME.test(name)) return `'${name}' is not a valid VHDL name: a letter first, then letters, digits and single underscores (not at the end).`;
    if (VHDL_WORDS.has(name.toLowerCase())) return `'${name}' is a reserved word of VHDL.`;
  }
  return null;
}

// The meaning of every identifier: the symbol it refers to (an index), in token order.
function meanings(a) {
  const idx = new Map(a.symbols.map((s, k) => [s, k]));
  return a.occs.map(o => (o.sym ? idx.get(o.sym) : o.ext ? `${o.ext.unit}.${o.ext.key}` : -1));
}

/**
 * Rename the symbol named at line / col to `newName`.
 * @returns {{ text, count, sym, edits }|{ error }} edits: [{ line, col, len }] in the old text
 */
export function renameSymbol(text, lang, line, col, newName) {
  const r = symbolAt(text, lang, line, col);
  if (r.error) return { error: r.error };
  const { sym, a } = r;
  newName = String(newName || '').trim();
  const bad = badName(newName, lang);
  if (bad) return { error: bad };
  const norm = lang === 'verilog' ? newName : newName.toLowerCase();
  // a port / generic of an entity: also the ports of its component declarations in this file
  const unit = interfaceUnit(sym);
  const occs = [...sym.occs, ...(unit ? a.occs.filter(o => o.sym && o.sym !== sym && o.sym.key === sym.key && o.sym.scope.kind === 'component' && o.sym.scope.sym?.key === unit.key) : [])];
  const edits = occs.filter(o => o.name !== newName).map(o => ({ line: o.line, col: o.col, len: o.len }));
  if (norm === sym.key) return { text: splice(text, edits, newName), count: occs.length, sym, edits };
  const clash = sym.scope.syms.get(norm);
  if (clash) return { error: `'${newName}' is already declared here (${kindWord(clash)} '${clash.name}'): choose another name.` };
  // the same objects must keep the same names: no occurrence may change its meaning
  const out = splice(text, edits, newName);
  const b = analyze(out, lang);
  const ma = meanings(a), mb = meanings(b);
  const map = new Map();
  let ok = ma.length === mb.length;
  for (let k = 0; ok && k < ma.length; k++) {
    if (map.has(ma[k])) ok = map.get(ma[k]) === mb[k];
    else map.set(ma[k], mb[k]);
  }
  if (ok) ok = new Set(map.values()).size === map.size;
  if (!ok) return { error: `'${newName}' is already used for another object where '${sym.name}' is visible: choose another name.` };
  return { text: out, count: occs.length, sym, edits };
}

/** The design unit (entity / module) a port or generic belongs to, or null. */
export function interfaceUnit(sym) {
  if (!sym || !['port', 'generic', 'parameter'].includes(sym.kind)) return null;
  const owner = sym.scope.sym;
  return owner && (owner.kind === 'entity' || owner.kind === 'module') ? owner : null;
}

/**
 * Rename a port / generic of `unit` in a source that uses the unit: the formals of the port and
 * generic maps of its instances (`a => x`, `.a(x)`) and, in VHDL, the ports of its component
 * declarations. Returns { text, count, edits } (the same text when the source does not use it).
 */
export function renameInterfaceInSource(text, lang, unit, oldName, newName) {
  const a = analyze(text, lang);
  const norm = s => (lang === 'verilog' ? String(s) : String(s).toLowerCase());
  const u = norm(unit), k = norm(oldName);
  const hits = new Set();
  for (const o of a.occs) {
    if (o.ext && norm(o.ext.unit) === u && o.ext.key === k) hits.add(o);
    const s = o.sym;
    if (s && s.key === k && s.scope.kind === 'component' && s.scope.sym?.key === u) hits.add(o);
  }
  const edits = [...hits].map(o => ({ line: o.line, col: o.col, len: o.len }));
  return { text: splice(text, edits, newName), count: edits.length, edits };
}

// ------------------------------------------------------------------ a declaration of a package (#2558)
// A type, constant, function… of a package is also renamed in the other sources that see it: VHDL's
// `use work.pkg.all` / `use work.pkg.x` and selected names `work.pkg.x`, Verilog's `import pkg::*` and
// `pkg::x`. The other source is analysed after the package's declaration, as if it followed it in one
// file: its names resolve through the scopes of core/scopes.js (a local declaration of the same name
// hides the package's; comments and strings are not names).

/** The package a declaration belongs to (its symbol), or null. */
export function packageOf(sym) {
  const owner = sym?.scope?.kind === 'package' ? sym.scope.sym : null;
  return owner?.kind === 'package' ? owner : null;
}

/** The text of the declaration of package `name` in a source (from `package` to its end), or null. */
export function packageDecl(text, lang, name) {
  const a = analyze(text, lang);
  const key = lang === 'verilog' ? String(name) : String(name).toLowerCase();
  const scope = a.scopes.find(s => s.kind === 'package' && s.sym?.kind === 'package' && s.sym.key === key);
  if (!scope || scope.end == null) return null;
  const T = a.tokens;
  let j = scope.end;
  if (lang === 'verilog') { if (T[j + 1]?.v === ':' && T[j + 2]?.k === 'id') j += 2; }
  else while (j < T.length - 1 && !(T[j].k === 'op' && T[j].v === ';')) j++;
  return text.slice(T[scope.tok].off, T[j].off + (T[j].len || T[j].v.length));
}

// A source analysed after a package's declaration: the analysis, the package and where the source starts.
function afterPackage(decl, text, lang) {
  const pre = decl + '\n';
  const a = analyze(pre + text, lang);
  const pk = a.symbols.find(s => s.kind === 'package' && s.scope === a.file);
  return { a, pk, at: pre.length, lines: pre.split('\n').length - 1 };
}

/**
 * Rename `oldName`, declared in the package whose declaration is `decl` (packageDecl), in a source
 * that uses the package. Returns { text, count, edits } (the same text when the source does not
 * use it), or { error } when the new name would make a name of the source mean another object.
 */
export function renamePackageItemInSource(text, lang, decl, oldName, newName) {
  const { a, pk, at, lines } = afterPackage(decl, text, lang);
  const sym = pk?.owner?.syms.get(lang === 'verilog' ? String(oldName) : String(oldName).toLowerCase());
  const inSource = o => a.tokens[o.i].off >= at;
  const occs = sym ? sym.occs.filter(inSource) : [];
  const edits = occs.filter(o => o.name !== newName).map(o => ({ line: o.line - lines, col: o.col, len: o.len }));
  const out = splice(text, edits, newName);
  if (edits.length) {
    // the package renamed too, every name of the source must still mean the same object
    const b = afterPackage(splice(decl, sym.occs.filter(o => !inSource(o)), newName), out, lang).a;
    const ma = meanings(a), mb = meanings(b);
    if (ma.length !== mb.length || ma.some((m, k) => m !== mb[k])) return { error: `'${newName}' is already used for another object where '${sym.name}' is visible: choose another name.` };
  }
  return { text: out, count: occs.length, edits };
}
