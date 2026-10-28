// Silinx - a schematic made from HDL, the source text pieces (#405: out of schematicFromHdl in schdoc-from-hdl.js):
// the VHDL context clause, generics and declarations, the Verilog module's parameters and declarations, and the text
// of each item (statement, process, instance) as written in the source with its comments, for the HDL blocks and the
// sheet's own HDL. Isomorphic ES module: no DOM and no Node APIs.
import { dedent, dedentBlock, lineStarts, offsetOf, prVlog, squash, stripComments, toSemi, tokAt, tokenize, unparen, vStmt, vStmtStart, withComments } from './schdoc.js';

// Verilog (#1716): a text as the compiler reads it, with the same offsets: its compiler directive lines and the lines of
// the `ifdef / `ifndef / `elsif / `else branches not taken blanked, the macros defined before (in the text and in the
// files it includes) deciding as the lexer does. A statement cut from it keeps no directive without its partner (the
// directives' choices kept). include(name): the text of an `include file, or null.
const DIRECTIVE = /^[ \t]*`(ifdef|ifndef|elsif|else|endif|define|undef|include|timescale|default_nettype|resetall|celldefine|endcelldefine|line|pragma)\b[ \t]*([^\n]*)/;
export function activeVerilog(text, include = () => null) {
  const defined = new Set();
  const scan = (src, depth, blank) => {
    // (a directive inside a block comment is not one)
    const lines = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).split('\n');
    const cond = [];
    const on = () => cond.every(c => c.active);
    lines.forEach((line, k) => {
      const m = DIRECTIVE.exec(line);
      if (!m) { if (blank && !on()) blank.add(k); return; }
      if (blank) blank.add(k);
      const arg = m[2].trim().split(/[\s(]/)[0], top = cond[cond.length - 1];
      if (m[1] === 'ifdef' || m[1] === 'ifndef') { const a = defined.has(arg) === (m[1] === 'ifdef'); cond.push({ active: a, taken: a }); }
      else if (m[1] === 'elsif') { if (top) { top.active = !top.taken && defined.has(arg); top.taken ||= top.active; } }
      else if (m[1] === 'else') { if (top) { top.active = !top.taken; top.taken = true; } }
      else if (m[1] === 'endif') cond.pop();
      else if (!on()) { /* not read */ }
      else if (m[1] === 'define') defined.add(arg);
      else if (m[1] === 'undef') defined.delete(arg);
      else if (m[1] === 'include' && depth < 16) {
        const inc = /^["<]([^">]+)[">]/.exec(m[2].trim());
        const t = inc ? include(inc[1]) : null;
        if (t != null) scan(String(t), depth + 1, null);
      }
    });
  };
  const blank = new Set();
  scan(String(text), 0, blank);
  return String(text).split('\n').map((l, k) => (blank.has(k) ? ' '.repeat(l.length) : l)).join('\n');
}
// the `include files of { path: text } as the compiler finds them: by path, else by base name
export const includeOf = (sources = {}) => name => {
  const base = name.split(/[\\/]/).pop();
  const p = name in sources ? name : Object.keys(sources).find(x => x.split(/[\\/]/).pop() === base);
  return p != null ? sources[p] : null;
};

/** { itemSpan } of schematicFromHdl (setArchTok: where the module's VHDL architecture starts, for the declarations
 *  read after; read: the Verilog text as the compiler reads it, activeVerilog). */
export function mountSourcePieces(ctx) {
  const {
    inst, archText, read = archText, ci, diags, doc, entText, itf, lang, ls, mod, toks, typeText, setArchTok
  } = ctx;
  // a piece of the Verilog text as read, without the lines blanked (a directive, a branch not taken)
  const piece = (a, b) => {
    const o = archText.slice(a, b).split('\n');
    return read.slice(a, b).split('\n').filter((l, k) => l.trim() || !o[k].trim()).join('\n');
  };

  const itemSpan = new Map();     // item -> { code, start, end }
  let modStart = 0, modEnd = toks.length;
  if (ci) {
    // context clause
    if (entText) {
      const et = tokenize(entText, 'vhdl'), els = lineStarts(entText);
      const eoff = offsetOf(els, mod.loc);
      const ctx = [];
      let st = 0;
      for (let k = 0; k < et.length && et[k].s < eoff;) {
        const e = toSemi(et, k);
        const v = et[k].v;
        if (v === 'library' || v === 'use') ctx.push(squash(stripComments(entText.slice(et[k].s, et[e - 1].e), 'vhdl')));
        else ctx.length = 0;
        if (e <= k) break;
        k = e; st = k;
      }
      doc.hdl.context = ctx.join('\n');
    }
    for (const g of itf.generics) doc.hdl.generics.push({ name: g.name, type: g.type, default: g.default });
    for (const [n, x] of itf.ports) typeText.set(n, x.type);
    if (archText) {
      // architecture <arch> of <entity> is ... begin
      let a = -1;
      for (let k = 0; k < toks.length; k++) if (toks[k].v === 'architecture' && toks[k + 2]?.v === 'of' && toks[k + 3]?.v === mod.name.toLowerCase()) { a = k; if (!mod.arch || toks[k + 1].v === mod.arch) break; }
      setArchTok(a);
      if (a >= 0) {
        doc.hdl.arch = toks[a + 1].raw || toks[a + 1].v;
        const isTok = a + 4;
        const firstItemOff = Math.min(...(mod.items || []).map(it => offsetOf(ls, it.loc)).filter(x => x >= 0), Infinity);
        let beginIdx = -1;
        for (let k = isTok + 1; k < toks.length; k++) {
          if (toks[k].s >= firstItemOff) break;
          if (toks[k].v === 'begin') beginIdx = k;
          if (!Number.isFinite(firstItemOff) && toks[k].v === 'end' && beginIdx >= 0 && toks[k - 1].v === 'begin') break;
        }
        if (beginIdx > isTok) {
          const raw = archText.slice(toks[isTok].e, toks[beginIdx].s);
          doc.hdl.decls = dedentBlock(raw);
          // (a name: an identifier or an extended identifier, \t[0]\, #1809)
          const id = String.raw`(?:\\(?:[^\\\n]|\\\\)+\\|[A-Za-z]\w*)`;
          for (const m of stripComments(raw, 'vhdl').matchAll(new RegExp(String.raw`\bsignal\s+(${id}(?:\s*,\s*${id})*)\s*:\s*([^;]*);`, 'gi'))) {
            const t = squash(m[2].split(':=')[0]);
            for (const [nm] of m[1].matchAll(new RegExp(id, 'g'))) typeText.set(nm.toLowerCase(), t);
          }
        }
      }
    }
    // item spans
    for (const it of mod.items || []) {
      if (!archText) break;
      const off = offsetOf(ls, it.loc);
      let i = tokAt(toks, off);
      while (i > 0 && ![';', 'begin'].includes(toks[i - 1].v) && toks[i].s > off - 200) {
        if (toks[i - 1].v === ':' || toks[i - 1].k === 'id' && toks[i]?.v === ':') { i--; continue; }
        break;
      }
      // label "lbl :" before loc
      if (toks[i - 1]?.v === ':' && toks[i - 2]?.k === 'id') i -= 2;
      const start = i;
      let j = i;
      if (toks[j + 1]?.v === ':' && toks[j]?.k === 'id') j += 2;
      if (toks[j]?.v === 'postponed') j++;
      let end;
      const kw = toks[j]?.v;
      if (it.kind === 'process' && kw === 'process') {
        let k = j;
        for (; k < toks.length; k++) if (toks[k].v === 'end' && toks[k + 1]?.v === 'process') break;
        end = toSemi(toks, k);
      } else if (it.kind === 'generate_for' || it.kind === 'generate_if' || kw === 'block') {
        let d = 0, k = j;
        const opener = kw === 'block' ? 'block' : 'generate';
        for (; k < toks.length; k++) {
          if (toks[k].v === opener && toks[k - 1]?.v !== 'end') d++;
          else if (toks[k].v === 'end' && toks[k + 1]?.v === opener) { d--; if (d === 0) break; }
        }
        end = toSemi(toks, k);
      } else end = toSemi(toks, j);
      const s0 = toks[start]?.s ?? 0, e0 = toks[end - 1]?.e ?? s0;
      const [a, b] = withComments(archText, s0, e0, 'vhdl');
      const col = a - (ls[archText.slice(0, a).split('\n').length - 1] ?? 0) + 1;
      itemSpan.set(it, { code: dedent(archText.slice(a, b), col), start: s0, end: e0, kw });
    }
  } else if (archText) {
    // Verilog: `timescale / `define, parameters, declarations
    const mo = offsetOf(ls, mod.loc);
    modStart = tokAt(toks, mo);
    for (let k = modStart; k < toks.length; k++) if (toks[k].v === 'endmodule') { modEnd = k; break; }
    const ctx = [];
    if (mod.timescale) {
      const u = ps => (ps >= 1e12 ? `${ps / 1e12}s` : ps >= 1e9 ? `${ps / 1e9}ms` : ps >= 1e6 ? `${ps / 1e6}us` : ps >= 1e3 ? `${ps / 1e3}ns` : ps >= 1 ? `${ps}ps` : `${ps * 1000}fs`);
      ctx.push(`\`timescale ${u(mod.timescale.unit)} / ${u(mod.timescale.precision)}`);
    }
    doc.hdl.context = ctx.join('\n');
    for (const p of mod.params || []) if (!p.local) doc.hdl.generics.push({ name: p.name, type: '', default: p.default ? unparen(prVlog(p.default)) : '0' });
    const portNames = new Set((mod.ports || []).map(p => p.name));
    const spans = new Map();
    for (const d of mod.decls || []) {
      const off = offsetOf(ls, d.loc);
      if (off < 0) continue;
      const st = vStmtStart(toks, tokAt(toks, off));
      if (st < modStart) continue;
      const kw = toks[st].v;
      if (['input', 'output', 'inout'].includes(kw)) continue;
      let en;
      if (kw === 'function' || kw === 'task') { en = st; while (en < modEnd && toks[en].v !== (kw === 'function' ? 'endfunction' : 'endtask')) en++; en++; }
      else en = toSemi(toks, st);
      if (!spans.has(st)) spans.set(st, { st, en, names: [] });
      spans.get(st).names.push(d.name);
    }
    // genvar statements
    for (let k = modStart; k < modEnd; k++) if (toks[k].v === 'genvar' && !spans.has(k)) spans.set(k, { st: k, en: toSemi(toks, k), names: [] });
    const declTexts = [];
    for (const sp of [...spans.values()].sort((a, b) => a.st - b.st)) {
      if (sp.names.some(n => portNames.has(n))) continue;
      // (with its comments and attributes, #225)
      const [a, b] = withComments(read, toks[sp.st].s, toks[sp.en - 1].e, lang);
      let txt = piece(a, b);
      // net declaration assignment "wire [3:0] s = a + b;" -> declaration only (assignment becomes a block)
      const kw = toks[sp.st].v;
      if (['wire', 'tri', 'logic', 'wand', 'wor', 'supply0', 'supply1'].includes(kw) && sp.names.length === 1) {
        const eq = toks.slice(sp.st, sp.en).findIndex(t => t.v === '=');
        if (eq > 0) { txt = piece(a, toks[sp.st + eq - 1].e) + ';'; sp.splitAssign = true; }
      }
      const col = a - (ls[archText.slice(0, a).split('\n').length - 1] ?? 0) + 1;
      declTexts.push(dedent(txt, col));
      sp.text = txt;
    }
    // the initial values of output ports declared in the header ("output reg [3:0] q = 4'd7", #225)
    for (const p of mod.ports || []) if (p.default && p.dir === 'out') declTexts.push(`initial ${p.name} = ${unparen(prVlog(p.default))};`);
    doc.hdl.decls = declTexts.join('\n');
    // items
    for (const it of mod.items || []) {
      const off = offsetOf(ls, it.loc);
      if (off < 0) continue;
      const st = vStmtStart(toks, tokAt(toks, off));
      const kw = toks[st]?.v;
      let en;
      let code;
      if (['always', 'initial', 'always_comb', 'always_ff', 'always_latch', 'final'].includes(kw)) en = vStmt(toks, st + 1);
      else if (it.kind === 'generate_for' || it.kind === 'generate_if') en = vStmt(toks, st);
      else en = toSemi(toks, st);
      const s0 = toks[st].s, e0 = toks[en - 1].e;
      const [a, b] = withComments(read, s0, e0, lang);
      const col = a - (ls[archText.slice(0, a).split('\n').length - 1] ?? 0) + 1;
      code = dedent(piece(a, b), col);
      if (['wire', 'tri', 'logic', 'wand', 'wor'].includes(kw) && it.kind === 'assign') {
        // from a net declaration assignment
        const eq = toks.slice(st, en).findIndex(t => t.v === '=');
        code = `assign ${squash(prVlog(it.target))} = ${piece(toks[st + eq + 1].s, toks[en - 2].e).trim()};`;
      } else if (it.kind === 'process' && it.initial && !['initial', 'always', 'always_comb', 'always_ff', 'always_latch', 'final'].includes(kw)
        && it.body?.length && it.body.every(b => b.kind === 'assign' && b.target)) {
        // a variable declared with its initial value ("reg [7:0] q = 8'h05;" of an output port q,
        // #225): an initial statement (the port is declared in the module's header)
        code = it.body.map(b => `initial ${squash(prVlog(b.target))} = ${unparen(prVlog(b.value))};`).join('\n');
      }
      if (it.kind === 'generate_for' || it.kind === 'generate_if') code = `generate\n${code}\nendgenerate`;
      itemSpan.set(it, { code, start: s0, end: e0, kw });
    }
  }
  if (!ci && archText) {
    // `define macros used by the verbatim pieces
    const used = [doc.hdl.decls, ...[...itemSpan.values()].map(x => x.code)].join('\n');
    // (the ones of the file before the module's end; #225: and the `include lines before the module
    // when a macro used is not defined in the file: the included file defines it)
    const upTo = archText.slice(0, toks[modEnd]?.s ?? archText.length);
    const defs = [...upTo.matchAll(/^[ \t]*`define\s+(\w+)[^\n]*$/gm)].filter(m => new RegExp('`' + m[1] + '\\b').test(used));
    const DIRECTIVES = /^(ifdef|ifndef|elsif|else|endif|define|undef|include|timescale|default_nettype|resetall|celldefine|endcelldefine|line|pragma|__FILE__|__LINE__)$/;
    const local = new Set([...upTo.matchAll(/^[ \t]*`define\s+(\w+)/gm)].map(m => m[1]));
    const foreign = [...used.matchAll(/`(\w+)/g)].some(m => !DIRECTIVES.test(m[1]) && !local.has(m[1]));
    const incs = foreign ? [...archText.slice(0, toks[modStart]?.s ?? 0).matchAll(/^[ \t]*`include\s+("[^"\n]*"|<[^>\n]*>)[^\n]*$/gm)] : [];
    if (defs.length || incs.length) doc.hdl.context = [doc.hdl.context, ...incs.map(m => m[0].trim()), ...defs.map(m => m[0].trim())].filter(Boolean).join('\n');
  }
  if (!archText) diags.push({ severity: 'warning', message: `source text of '${inst.module}' not available: HDL blocks are placeholders` });

  return { itemSpan };
}
