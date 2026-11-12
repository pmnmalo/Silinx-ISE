// The simulator's wave configuration as a file (#1019): the signals shown in the wave window, their order and radix,
// the dividers and the groups, the markers; written and read as ISim's .wcfg (an XML <wave_config> of <wvobject>s), so
// that a configuration saved by ISim reads here too (its database references and its other properties are ignored).
//
//   writeWcfg({ tops: ['tb_top'], rows, markers: [100000] }) → the file's text
//   readWcfg(text) → { tops, rows, markers }     (throws: not a wave configuration)
//
// rows: { kind: 'sig', path: '/tb_top/uut/cnt', name: 'cnt', type: 'logic' | 'array' | 'other', radix, expanded }
//       { kind: 'div', name }       { kind: 'group', name, expanded, rows: [ …its signals and dividers ] }
// radix: 'default' | 'bin' | 'hex' | 'oct' | 'udec' | 'sdec' | 'c1dec' | 'ascii' (the simulator's; c1dec, one's complement, has no ISE radix and is not written); markers: times in ps.
// wcfgPath and wcfgList: the configurations' files in a project (web/js/sim-wcfg.js). wcfgSignal and placeWcfg: a
// configuration's rows from and onto an elaborated design's signals, the wave window's (web/js/isim-wcfg.js) and the
// MCP's (server/mcp-wcfg.js, #2839).
import { escXmlApos } from './escape.js';

const RADIX = { bin: 'BINARYRADIX', hex: 'HEXRADIX', oct: 'OCTALRADIX', udec: 'UNSIGNEDDECRADIX', sdec: 'SIGNEDDECRADIX', ascii: 'ASCIIRADIX' };
const RADIX_OF = Object.fromEntries(Object.entries(RADIX).map(([k, v]) => [v, k]));

const esc = escXmlApos;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// (a character reference past Unicode, &#x110000; on: the file's error, #3557)
const unesc = s => String(s).replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
  if (e[0] !== '#') return ENT[e.toLowerCase()];
  const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  if (cp > 0x10ffff) throw new Error(`malformed XML: invalid character reference '${m.length > 20 ? `${m.slice(0, 17)}...` : m}'`);
  return String.fromCodePoint(cp);
});

/** The text of a .wcfg file of the configuration. */
export function writeWcfg({ tops = [], rows = [], markers = [] } = {}) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<wave_config>', '   <wave_state>', '   </wave_state>',
    '   <db_ref_list>', '      <db_ref path="./isim.wdb" id="1" type="auto">', '         <top_modules>',
    ...tops.map(t => `            <top_module name="${esc(t)}" />`),
    '         </top_modules>', '      </db_ref>', '   </db_ref_list>', `   <WVObjectSize size="${rows.length}" />`];
  const prop = (ind, name, value) => out.push(`${ind}   <obj_property name="${name}">${esc(value)}</obj_property>`);
  const obj = (r, ind, at) => {
    if (r.kind === 'div') {
      out.push(`${ind}<wvobject fp_name="divider${at}" type="divider">`);
      prop(ind, 'label', r.name ?? ''); prop(ind, 'DisplayName', 'label');
    } else if (r.kind === 'group') {
      out.push(`${ind}<wvobject fp_name="group${at}" type="group">`);
      prop(ind, 'label', r.name ?? ''); prop(ind, 'DisplayName', 'label');
      if (r.expanded === false) prop(ind, 'isExpanded', 'false');
      (r.rows || []).forEach((c, i) => obj(c, `${ind}   `, `${at}_${i}`));
    } else {
      out.push(`${ind}<wvobject fp_name="${esc(r.path)}" type="${esc(r.type || 'logic')}">`);
      const name = r.name ?? String(r.path).split('/').pop();
      prop(ind, 'ElementShortName', name); prop(ind, 'ObjectShortName', name);
      if (RADIX[r.radix]) prop(ind, 'Radix', RADIX[r.radix]);
      if (r.expanded) prop(ind, 'isExpanded', 'true');
    }
    out.push(`${ind}</wvobject>`);
  };
  rows.forEach((r, i) => obj(r, '   ', i + 1));
  if (markers.length) {
    out.push('   <wave_markers>');
    for (const t of markers) out.push(`      <marker time="${Math.round(t)}" label="" />`);
    out.push('   </wave_markers>');
  }
  out.push('</wave_config>', '');
  return out.join('\n');
}

// the XML as a tree of { name, attrs, children, text } (the subset a .wcfg uses: elements, attributes, text), read in
// one pass (#3557: the regular expressions that took out the comments, the instructions and the CDATA went to the end
// of the text from each unclosed one); the text between two tags is unescaped whole (its CDATA escaped first)
function parseXml(text) {
  const src = String(text), n = src.length;
  const root = { name: '', attrs: {}, children: [], text: '' };
  const stack = [root];
  const near = k => new Error(`malformed XML near '${src.slice(k, k + 20)}'`);
  let raw = '';
  const flush = () => { if (raw) stack[stack.length - 1].text += unesc(raw); raw = ''; };
  for (let i = 0; i < n;) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { raw += src.slice(i); break; }
    raw += src.slice(i, lt);
    i = lt;
    const skip = [['<!--', '-->'], ['<?', '?>'], ['<![CDATA[', ']]>']].find(([o]) => src.startsWith(o, i));
    if (skip) {
      const e = src.indexOf(skip[1], i + skip[0].length);
      if (e < 0) throw near(i);
      if (skip[0] === '<![CDATA[') raw += esc(src.slice(i + 9, e));
      i = e + skip[1].length;
      continue;
    }
    const t = tagAt(src, i);
    if (!t) throw near(i);
    flush();
    const top = stack[stack.length - 1];
    if (t.close) {
      if (top.name !== t.name) throw new Error(`malformed XML: </${t.name}> closes <${top.name || 'nothing'}>`);
      stack.pop();
    } else {
      const el = { name: t.name, attrs: t.attrs, children: [], text: '' };
      top.children.push(el);
      if (!t.self) stack.push(el);
    }
    i = t.end;
  }
  flush();
  if (stack.length > 1) throw new Error(`malformed XML: <${stack[stack.length - 1].name}> not closed`);
  return root;
}

// the tag at s[i] ('<'): { close, name, attrs, self, end } (end: just after its '>'), null if it is none: as
// /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/ read it
function tagAt(s, i) {
  const sp = k => /\s/.test(s[k] ?? ''), nm = k => /[\w:.-]/.test(s[k] ?? '');
  let j = i + 1;
  const close = s[j] === '/';
  if (close) j++;
  if (!/[A-Za-z_]/.test(s[j] ?? '')) return null;
  const n0 = j;
  while (nm(j)) j++;
  const name = s.slice(n0, j), attrs = {};
  for (;;) {   // an attribute: \s+ name \s* = \s* "value" | 'value'
    let k = j;
    while (sp(k)) k++;
    const a0 = k;
    if (k === j || !nm(k)) break;
    while (nm(k)) k++;
    const a = s.slice(a0, k);
    while (sp(k)) k++;
    if (s[k] !== '=') break;
    k++;
    while (sp(k)) k++;
    const q = s[k], e = q === '"' || q === "'" ? s.indexOf(q, k + 1) : -1;
    if (e < 0) break;
    attrs[a] = unesc(s.slice(k + 1, e));
    j = e + 1;
  }
  while (sp(j)) j++;
  const self = s[j] === '/';
  if (self) j++;
  return s[j] === '>' ? { close, name, attrs, self, end: j + 1 } : null;
}

/** The configuration of a .wcfg file's text: { tops, rows, markers }. */
export function readWcfg(text) {
  const cfg = parseXml(text).children.find(e => e.name === 'wave_config');
  if (!cfg) throw new Error('not a wave configuration (no <wave_config>)');
  const all = (el, name) => {   // the elements of that name under el, at any depth (not inside a wvobject)
    const out = [];
    for (const c of el.children) { if (c.name === name) out.push(c); else if (c.name !== 'wvobject') out.push(...all(c, name)); }
    return out;
  };
  const props = el => Object.fromEntries(el.children.filter(c => c.name === 'obj_property').map(p => [p.attrs.name, p.text.trim()]));
  const row = el => {
    const p = props(el), type = el.attrs.type || '';
    if (type === 'divider') return { kind: 'div', name: p.label ?? '' };
    if (type === 'group') return { kind: 'group', name: p.label ?? '', expanded: p.isExpanded !== 'false', rows: el.children.filter(c => c.name === 'wvobject').map(row) };
    const path = el.attrs.fp_name || '';
    return { kind: 'sig', path, name: p.ElementShortName || path.split('/').pop(), type: type || 'logic', radix: RADIX_OF[p.Radix] || 'default', expanded: p.isExpanded === 'true' };
  };
  return {
    tops: all(cfg, 'top_module').map(t => t.attrs.name).filter(Boolean),
    rows: cfg.children.filter(c => c.name === 'wvobject').map(row),
    markers: all(cfg, 'marker').map(m => Number(m.attrs.time)).filter(t => Number.isFinite(t) && t >= 0),
  };
}

/** The project path of a name typed for a wave configuration ('.wcfg' added when it has none), or null when it is not
 *  a file name of the project (letters, digits, _ . - in its folders and its name; no '..'). */
export function wcfgPath(name) {
  let p = String(name ?? '').trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  if (!p) return null;
  if (!/\.wcfg$/i.test(p)) p += '.wcfg';
  const parts = p.split('/');
  return parts.every(s => /^[A-Za-z0-9_][\w.-]*$/.test(s) && !/^\.+$/.test(s)) && !parts.includes('..') ? p : null;
}

/** The project's wave configurations (files: its paths), the module's own (<mod>.wcfg) first, then by name. */
export function wcfgList(files, mod) {
  const own = f => f.split('/').pop().toLowerCase() === `${String(mod).toLowerCase()}.wcfg`;
  return files.filter(f => /\.wcfg$/i.test(f)).sort((a, b) => (own(b) - own(a)) || a.localeCompare(b));
}

/** A signal's path in a configuration (an elaborated design's 'tb.uut.cnt': '/tb/uut/cnt'). */
export const wcfgSigPath = sig => '/' + String(sig.path || sig.name).replace(/\./g, '/');

/** A signal of an elaborated design as a configuration's row. */
export function wcfgSignal(sig, { radix = 'default', expanded = false } = {}) {
  const t = sig.t || {};
  return { kind: 'sig', path: wcfgSigPath(sig), name: sig.name, radix, expanded: !!expanded,
    type: t.kind === 'logic' && t.w === 1 ? 'logic' : t.kind === 'logic' ? 'array' : 'other' };
}

/** A configuration's rows on a design's signals: { rows, missing } in the wave window's one level of groups (a group in
 *  a group: its members in the outer one), a signal row's sig the design's; missing: the paths the design has not. */
export function placeWcfg(cfgRows, signals) {
  const byPath = new Map(signals.map(s => [wcfgSigPath(s), s]));
  const missing = [];
  const place = (list, inGroup) => list.flatMap(r => {
    if (r.kind === 'div') return [{ kind: 'div', name: r.name }];
    if (r.kind === 'group') return inGroup ? place(r.rows, true) : [{ kind: 'group', name: r.name, expanded: r.expanded !== false, rows: place(r.rows, true) }];
    const sig = byPath.get(r.path);
    if (!sig) { missing.push(r.path); return []; }
    return [{ kind: 'sig', sig, radix: r.radix, expanded: !!r.expanded }];
  });
  return { rows: place(cfgRows, false), missing };
}
