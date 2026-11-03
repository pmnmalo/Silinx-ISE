// Silinx - an HDL source translated to the other language (#2693): the Design pane's read-only view of a VHDL source in
// the Verilog of a Verilog project, and of a Verilog source in the VHDL of a VHDL project. Each of the file's modules is
// translated from the parser's IR (core/translate-to-verilog.js, core/translate-to-vhdl.js); what has no translation is
// said, with its line, and nothing of that file is shown translated. The comments are not carried over (the IR has
// none). Isomorphic ES module: no DOM and no Node APIs.
//
//   translateSource(text, { path, to, sources }) -> { ok, text, lang, errors: [{ line, message }] }
//     to: 'vhdl' | 'verilog'; sources: the project's other HDL sources ([{ path, text }]: a VHDL file's packages, a
//     Verilog module's ports for an instance connected by position).
import { langOfPath } from './compile.js';
import { parse as parseVhdl } from './vhdl/parser.js';
import { parse as parseVerilog } from './verilog/parser.js';
import { moduleToVerilog } from './translate-to-verilog.js';
import { moduleToVhdl } from './translate-to-vhdl.js';
import { Untranslatable } from './translate-util.js';

const NAME = { vhdl: 'VHDL', verilog: 'Verilog' };
const parseAs = (lang, text, path) => (lang === 'vhdl' ? parseVhdl(text, path) : parseVerilog(text, path));

/** The language a module's HDL file is translated to in the Design pane: the project's Preferred Language when the
 *  file is in the other one, else null (no translation). */
export function translationLang(path, preferred) {
  const from = langOfPath(path);
  const to = preferred === 'verilog' ? 'verilog' : 'vhdl';
  return from && from !== to ? to : null;
}

/** The translated file's name: its own, of the other language's extension. */
export const translatedPath = (path, to) => String(path).replace(/\.(vhdl?|s?v)$/i, to === 'vhdl' ? '.vhd' : '.v');

export function translateSource(text, { path = 'input', to, sources = [] } = {}) {
  const from = langOfPath(path);
  const name = String(path).split('/').pop();
  const fail = errors => ({ ok: false, lang: to, errors, text: comment(to, [`${name} cannot be translated to ${NAME[to]}:`, ...errors.map(e => `  ${e.line ? `line ${e.line}: ` : ''}${e.message}`)]) });
  if (!from || !NAME[to] || from === to) return fail([{ line: null, message: `it is not a source in ${from === 'vhdl' ? 'Verilog' : 'VHDL'}` }]);
  let r;
  try { r = parseAs(from, text, path); } catch (e) { return fail([{ line: null, message: e.message }]); }
  const perr = (r.errors || []).filter(e => e.severity !== 'warning');
  if (perr.length) return fail(perr.map(e => ({ line: e.line, message: `${e.message} (the source has errors: check its syntax)` })));
  const others = sources.filter(s => s.path !== path && langOfPath(s.path) === from).flatMap(s => {
    try { return parseAs(from, s.text, s.path).units || []; } catch { return []; }
  });
  const units = r.units || [];
  const errors = [], parts = [];
  let timescale = false;
  const renamed = [];
  if (!units.some(u => u.kind === 'module')) errors.push({ line: units[0]?.loc?.line ?? null, message: `a file with no ${from === 'vhdl' ? 'entity' : 'module'}` });
  for (const u of units) {
    if (u.kind !== 'module') {
      if (from === 'vhdl' && u.kind === 'package') continue;   // (its declarations copied into the units that use it)
      errors.push({ line: u.loc?.line ?? null, message: `a ${u.kind} (only ${from === 'vhdl' ? 'entities and their architectures' : 'modules'} are translated)` });
      continue;
    }
    try {
      const o = from === 'vhdl'
        ? moduleToVerilog(u, { spell: spellings(text), packages: [...units, ...others].filter(x => x.kind === 'package') })
        : moduleToVhdl(u, { modules: [...units, ...others].filter(x => x.kind === 'module') });
      parts.push(o.text);
      timescale ||= o.timescale;
      renamed.push(...o.renamed);
    } catch (e) {
      if (!(e instanceof Untranslatable)) throw e;
      errors.push({ line: e.line, message: `${e.message} cannot be translated to ${NAME[to]}` });
    }
  }
  if (errors.length) return fail(errors);
  const head = [`${name}, translated from ${NAME[from]} by Silinx: read-only, the comments not carried over.`,
    ...(renamed.length ? [`Renamed (reserved words in ${NAME[to]}): ${renamed.map(([a, b]) => `${a} -> ${b}`).join(', ')}.`] : [])];
  const text2 = [comment(to, head), ...(timescale && to === 'verilog' ? ['`timescale 1ns / 1ps'] : []), '', parts.join('\n\n'), ''].join('\n');
  return { ok: true, lang: to, errors: [], text: text2 };
}

const comment = (lang, lines) => lines.map(l => `${lang === 'vhdl' ? '--' : '//'} ${l}`.trimEnd()).join('\n');

// VHDL's names as the source writes them (the IR has them in lower case): the first spelling of each, outside comments
// and strings
function spellings(text) {
  const map = new Map();
  for (const m of text.replace(/--.*$/gm, '').replace(/\b[bBoOxX]?"[^"\n]*"/g, '""').matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
    const l = m[0].toLowerCase();
    if (!map.has(l)) map.set(l, m[0]);
  }
  return n => map.get(n) || n;
}
