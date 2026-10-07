// Rename a module/entity in HDL sources: only the places that name the design unit are changed
// (its declaration and end, `architecture … of X`, components, `entity work.X`, instances), never
// other identifiers that happen to have the same name.
//
// Isomorphic module (browser + Node).

import { lex } from './vhdl/lexer.js';
import { tokenize } from './verilog/lexer.js';

/** Offsets of each line start, to turn token line/col (1-based) into string offsets. */
function lineStarts(text) {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1);
  return out;
}

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
