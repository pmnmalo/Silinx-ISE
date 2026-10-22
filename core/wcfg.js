// The simulator's wave configuration as a file (#1019): the signals shown in the wave window, their order and radix,
// the dividers and the groups, the markers; written and read as ISim's .wcfg (an XML <wave_config> of <wvobject>s), so
// that a configuration saved by ISim reads here too (its database references and its other properties are ignored).
//
//   writeWcfg({ tops: ['tb_top'], rows, markers: [100000] }) → the file's text
//   readWcfg(text) → { tops, rows, markers }     (throws: not a wave configuration)
//
// rows: { kind: 'sig', path: '/tb_top/uut/cnt', name: 'cnt', type: 'logic' | 'array' | 'other', radix, expanded }
//       { kind: 'div', name }       { kind: 'group', name, expanded, rows: [ …its signals and dividers ] }
// radix: 'default' | 'bin' | 'hex' | 'oct' | 'udec' | 'sdec' | 'ascii' (the simulator's); markers: times in ps.
// wcfgPath and wcfgList: the configurations' files in a project (web/js/sim-wcfg.js).

const RADIX = { bin: 'BINARYRADIX', hex: 'HEXRADIX', oct: 'OCTALRADIX', udec: 'UNSIGNEDDECRADIX', sdec: 'SIGNEDDECRADIX', ascii: 'ASCIIRADIX' };
const RADIX_OF = Object.fromEntries(Object.entries(RADIX).map(([k, v]) => [v, k]));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unesc = s => String(s).replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]);

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

// the XML as a tree of { name, attrs, children, text } (the subset a .wcfg uses: elements, attributes, text)
function parseXml(text) {
  const root = { name: '', attrs: {}, children: [], text: '' };
  const stack = [root];
  const src = String(text).replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (m, c) => esc(c));
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  for (let m; (m = re.exec(src));) {
    const top = stack[stack.length - 1];
    if (m[6]) throw new Error(`malformed XML near '${src.slice(m.index, m.index + 20)}'`);
    if (m[5] != null) { top.text += unesc(m[5]); continue; }
    if (m[1]) {
      if (top.name !== m[2]) throw new Error(`malformed XML: </${m[2]}> closes <${top.name || 'nothing'}>`);
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unesc(a[2] ?? a[3]);
    const el = { name: m[2], attrs, children: [], text: '' };
    top.children.push(el);
    if (!m[4]) stack.push(el);
  }
  if (stack.length > 1) throw new Error(`malformed XML: <${stack[stack.length - 1].name}> not closed`);
  return root;
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
