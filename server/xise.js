// ISE 14.7 Project Navigator project file (.xise) export / import.
//
// Format checked against .xise files saved by ISE 14.7 (schema_version 2): root
// <project xmlns="http://www.xilinx.com/XMLSchema" xmlns:xil_pn="http://www.xilinx.com/XMLSchema">
// with <header>, <version>, <files>, <properties>, <bindings/>, <libraries/>, <autoManagedFiles>.
// Only the properties that differ from ISE defaults are written; ISE fills in the rest on open.
// Top-level values use ISE's "Module|name" (Verilog) / "Architecture|entity|arch" (VHDL) syntax.

import { FAMILY_INFO, deviceFamily, familyFromXise, familyOfPart, familyName } from '../core/family.js';
import { convertIseSchematics, exportIseSch } from '../core/isesch.js';
import { compile, langOfPath } from '../core/compile.js';
import { modulesFromLibrary } from '../core/schdoc.js';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = s => String(s ?? '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');

const STARTUP = { JtagClk: 'JTAG Clock', Cclk: 'CCLK', CCLK: 'CCLK', UserClk: 'User Clock' };

/** Find "architecture <arch> of <entity>" in VHDL text. */
function vhdlArch(text, entity) {
  const re = new RegExp(`\\barchitecture\\s+(\\w+)\\s+of\\s+${entity}\\b`, 'i');
  return (re.exec(text || '') || [])[1] || null;
}

/** ISE top-level value for a unit. */
function topValue(project, name, sources) {
  if (!name) return '';
  const files = project.files || [];
  for (const f of files) {
    if (f.lang !== 'vhdl') continue;
    const txt = sources?.[f.path];
    if (txt && new RegExp(`\\bentity\\s+${name}\\s+is\\b`, 'i').test(txt)) {
      const arch = vhdlArch(txt, name);
      if (arch) return { value: `Architecture|${name}|${arch}`, file: f.path };
    }
  }
  const vf = files.find(f => f.lang === 'verilog' && sources?.[f.path] && new RegExp(`\\bmodule\\s+${name}\\b`).test(sources[f.path]));
  return { value: `Module|${name}`, file: vf?.path || null };
}

/**
 * Build .xise XML for a project.
 * @param {object} project  Silinx project json
 * @param {object} [opts]   { sources: { path: text } } (optional, used to detect VHDL architectures / top files)
 */
export function exportXise(project, { sources, schematics = [], extraFiles = [] } = {}) {
  const dev = project.device || {};
  const impl = project.impl || {};
  // ISE schematics (exported .sch) stand for the HDL generated from them; ISE generates that itself
  const bySch = new Set(schematics.map(x => x.hdl));
  const files = (project.files || []).filter(f => !bySch.has(f.path)).concat(extraFiles);
  const lines = [XML_HEADER, '<project xmlns="http://www.xilinx.com/XMLSchema" xmlns:xil_pn="http://www.xilinx.com/XMLSchema">', ''];
  lines.push('  <header>',
    '    <!-- ISE source project file exported by Silinx.                     -->',
    '    <!-- Open it in ISE 14.7 Project Navigator; ISE completes the defaults. -->',
    '  </header>', '');
  lines.push('  <version xil_pn:ise_version="14.7" xil_pn:schema_version="2"/>', '');
  lines.push('  <files>');
  let seq = 1;
  for (const f of files) {
    const type = f.lang === 'vhdl' ? 'FILE_VHDL' : f.lang === 'verilog' ? 'FILE_VERILOG' : null;
    if (!type) continue;
    lines.push(`    <file xil_pn:name="${esc(f.path)}" xil_pn:type="${type}">`);
    if ((f.role || 'design') === 'design') {
      lines.push(`      <association xil_pn:name="BehavioralSimulation" xil_pn:seqID="${seq}"/>`);
      lines.push(`      <association xil_pn:name="Implementation" xil_pn:seqID="${seq}"/>`);
    } else {
      lines.push(`      <association xil_pn:name="BehavioralSimulation" xil_pn:seqID="${seq}"/>`);
    }
    lines.push('    </file>');
    seq++;
  }
  for (const x of schematics) {
    lines.push(`    <file xil_pn:name="${esc(x.path)}" xil_pn:type="FILE_SCHEMATIC">`);
    lines.push(`      <association xil_pn:name="BehavioralSimulation" xil_pn:seqID="${seq}"/>`);
    if ((x.role || 'design') === 'design') lines.push(`      <association xil_pn:name="Implementation" xil_pn:seqID="${seq}"/>`);
    lines.push('    </file>');
    seq++;
  }
  if (project.constraints) {
    lines.push(`    <file xil_pn:name="${esc(project.constraints)}" xil_pn:type="FILE_UCF">`,
      '      <association xil_pn:name="Implementation" xil_pn:seqID="0"/>', '    </file>');
  }
  lines.push('  </files>', '');

  const top = project.top ? topValue(project, project.top, sources) : null;
  const schOf = p => schematics.find(x => x.hdl === p)?.path;
  if (top?.file && schOf(top.file)) top.file = schOf(top.file);
  const sim = project.simTop ? topValue(project, project.simTop, sources) : null;
  const vhdlCount = files.filter(f => f.lang === 'vhdl').length;
  const prefLang = vhdlCount > files.length / 2 ? 'VHDL' : 'Verilog';
  const fam = deviceFamily(dev) || 'spartan3e';
  const props = [
    ['Device Family', FAMILY_INFO[fam]?.xise || 'Spartan3E'],
    ['Device', String(dev.part || 'xc3s500e').toLowerCase()],
    ['Package', String(dev.package || 'fg320').toLowerCase()],
    ['Speed Grade', String(dev.speed || '-4').startsWith('-') ? String(dev.speed || '-4') : `-${dev.speed}`],
    ['Top-Level Source Type', 'HDL'],
    ['Synthesis Tool', 'XST (VHDL/Verilog)'],
    ['Simulator', 'ISim (VHDL/Verilog)'],
    ['Preferred Language', prefLang],
    ['Optimization Goal', /^area$/i.test(impl.optMode || '') ? 'Area' : 'Speed'],
    ['Optimization Effort', String(impl.optLevel) === '2' ? 'High' : 'Normal'],
    ['FPGA Start-Up Clock', STARTUP[impl.startupClk] || 'JTAG Clock'],
  ];
  if (top) {
    props.push(['Auto Implementation Top', 'false']);
    props.push(['Implementation Top', top.value]);
    if (top.file) props.push(['Implementation Top File', top.file]);
    props.push(['Implementation Top Instance Path', `/${project.top}`]);
    props.push(['PROP_DesignName', project.name || project.top]);
  }
  if (sim) {
    props.push(['PROP_BehavioralSimTop', sim.value]);
    props.push(['Selected Simulation Root Source Node Behavioral', `work.${project.simTop}`]);
  }
  props.push(['PROP_DevFamilyPMName', FAMILY_INFO[fam]?.pm || 'spartan3e']);
  lines.push('  <properties>');
  for (const [k, v] of props) lines.push(`    <property xil_pn:name="${esc(k)}" xil_pn:value="${esc(v)}" xil_pn:valueState="non-default"/>`);
  lines.push('  </properties>', '', '  <bindings/>', '', '  <libraries/>', '', '  <autoManagedFiles>', '  </autoManagedFiles>', '', '</project>', '');
  return lines.join('\n');
}

/** Attributes of a start tag string, keys with the xil_pn: prefix stripped. */
function attrs(tag) {
  const out = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].replace(/^xil_pn:/, '')] = unesc(m[3] ?? m[4]);
  return out;
}

/** "Module|top" / "Architecture|top|rtl" / "work.tb" -> unit name. */
function unitName(v) {
  if (!v) return '';
  const parts = String(v).split('|');
  if (parts.length >= 2) return parts[1];
  return String(v).replace(/^work\./, '');
}

/**
 * Parse .xise XML into a partial Silinx project:
 * { device, top, simTop, files:[{path,lang,role}], constraints, impl, name? }
 */
export function importXise(xml) {
  const text = String(xml || '').replace(/<!--[\s\S]*?-->/g, '');
  if (!/<project\b/.test(text)) throw Object.assign(new Error('not an ISE .xise project file (no <project> element)'), { status: 400 });

  const files = [];
  const schematics = [];
  const unsupported = [];
  let constraints = null;
  const fileRe = /<file\b([^>]*?)(\/>|>([\s\S]*?)<\/file>)/g;
  let m;
  while ((m = fileRe.exec(text))) {
    const a = attrs(m[1]);
    const name = (a.name || '').replace(/\\/g, '/');
    const type = (a.type || '').toUpperCase();
    const assoc = [...(m[3] || '').matchAll(/<association\b([^>]*)\/?>/g)].map(x => attrs(x[1]).name);
    if (type === 'FILE_UCF' || /\.ucf$/i.test(name)) { if (!constraints) constraints = name; continue; }
    if (type === 'FILE_SCHEMATIC' || /\.sch$/i.test(name)) { schematics.push({ path: name, role: assoc.includes('Implementation') || !assoc.length ? 'design' : 'sim' }); continue; }
    const lang = type === 'FILE_VHDL' || /\.vhdl?$/i.test(name) ? 'vhdl' : type === 'FILE_VERILOG' || /\.(v|sv)$/i.test(name) ? 'verilog' : null;
    if (!lang) { if (name) unsupported.push({ name, type: type || '?' }); continue; }
    const role = assoc.includes('Implementation') || !assoc.length ? 'design' : 'sim';
    files.push({ path: name, lang, role });
  }

  const props = {};
  for (const p of text.matchAll(/<property\b([^>]*)\/?>/g)) {
    const a = attrs(p[1]);
    if (a.name) props[a.name] = a.value ?? '';
  }
  const part = String(props['Device'] || '').toLowerCase() || null;
  const device = {
    family: familyOfPart(part) || familyFromXise(props['Device Family']) || familyFromXise(props['PROP_DevFamilyPMName']) || 'spartan3e',
    part,
    package: String(props['Package'] || '').toLowerCase() || null,
    speed: props['Speed Grade'] || null,
  };
  if (device.speed && !device.speed.startsWith('-')) device.speed = `-${device.speed}`;
  const fam = String(props['Device Family'] || '');
  const warnings = [];
  const KIND = { FILE_SCHEMATIC: 'ISE schematic (.sch)', FILE_COREGEN: 'CORE Generator IP (.xco)', FILE_COREGENISE: 'CORE Generator IP (.xco)', FILE_STATEDIAGRAM: 'StateCAD state diagram (.dia)', FILE_XCO: 'CORE Generator IP (.xco)' };
  for (const u of unsupported) {
    const kind = KIND[u.type] || (/\.sch$/i.test(u.name) ? KIND.FILE_SCHEMATIC : /\.xco$/i.test(u.name) ? KIND.FILE_COREGEN : /\.dia$/i.test(u.name) ? KIND.FILE_STATEDIAGRAM : `${u.type} file`);
    warnings.push(`${u.name}: ${kind} is not converted by Silinx and was left out of the project (the file itself is kept in the project folder when importing a .zip)`);
  }
  if (fam && !familyFromXise(fam)) warnings.push(`device family '${fam}' is not an FPGA family supported by Silinx (${familyName(device.family)} assumed)`);

  const top = unitName(props['Implementation Top']) || (props['Implementation Top Instance Path'] || '').replace(/^\//, '') || '';
  const simTop = unitName(props['PROP_BehavioralSimTop']) || unitName(props['Selected Simulation Root Source Node Behavioral']) || '';
  const impl = {
    optMode: /area/i.test(props['Optimization Goal'] || '') ? 'Area' : 'Speed',
    optLevel: /high/i.test(props['Optimization Effort'] || '') ? 2 : 1,
    startupClk: /cclk/i.test(props['FPGA Start-Up Clock'] || '') ? 'Cclk' : /user/i.test(props['FPGA Start-Up Clock'] || '') ? 'UserClk' : 'JtagClk',
  };
  const lang = /verilog/i.test(props['Preferred Language'] || '') ? 'verilog' : 'vhdl';
  const out = { device, top, simTop, files, schematics, lang, constraints, impl, warnings };
  if (props['PROP_DesignName']) out.name = props['PROP_DesignName'];
  return out;
}

/**
 * ISE schematics of an imported project -> Silinx schematics (.sch.json) + the HDL kept in sync with them.
 * schFiles: { targetPath: schText }; existing(path): text of a file the import carries (a Silinx
 * export already has the .sch.json and its HDL, which keep the exact drawing).
 * Returns [{ sch, json, jsonText, hdl, code, lang, warnings }] (json/hdl missing when it failed).
 */
export function importIseSchematics(schFiles, { sources = {}, symbols = {}, lang = 'vhdl', existing = () => undefined } = {}) {
  const out = [], todo = {};
  for (const [p, text] of Object.entries(schFiles)) {
    const json = p.replace(/\.sch$/i, '.sch.json');
    const prev = existing(json);
    if (typeof prev === 'string') {
      try {
        const doc = JSON.parse(prev);
        const code = doc.generatedFile ? existing(doc.generatedFile) : undefined;
        if (typeof code === 'string') { out.push({ sch: p, json, jsonText: prev, hdl: doc.generatedFile, code, lang: langOfPath(doc.generatedFile), warnings: [] }); continue; }
      } catch { /* convert the .sch instead */ }
    }
    todo[p] = text;
  }
  const known = { ...sources };
  for (const r of out) known[r.hdl] = r.code;
  for (const r of convertIseSchematics(todo, { sources: known, symbols, lang })) {
    const warnings = r.warnings.map(w => (w.startsWith(r.sch) ? w : `${r.sch}: ${w}`));
    if (!r.doc) { out.push({ sch: r.sch, warnings }); continue; }
    out.push({ sch: r.sch, json: r.json, jsonText: JSON.stringify(r.doc, null, 1), hdl: r.hdl, code: r.code, lang, warnings });
  }
  return out;
}

/**
 * Silinx schematics -> ISE schematics for a project export.
 * docs: { 'src/x.sch.json': doc }, sources: { path: text } (the project's HDL).
 * Returns { schematics: [{ path, hdl, role }], extraFiles: [{ path, lang, role }], files: [{ path, text }], warnings }.
 */
export function exportIseSchematics(project, docs, sources) {
  const res = { schematics: [], extraFiles: [], files: [], warnings: [] };
  const entries = Object.entries(docs).filter(([, d]) => d?.generatedFile && (project.files || []).some(f => f.path === d.generatedFile));
  if (!entries.length) return res;
  let modules = {};
  try {
    const hdl = Object.fromEntries(Object.entries(sources).filter(([p]) => /\.(vhdl?|v|sv)$/i.test(p)));
    modules = modulesFromLibrary(compile(Object.entries(hdl).map(([path, text]) => ({ path, text }))), { sources: hdl });
  } catch { /* export without module pin data */ }
  const family = deviceFamily(project.device || {}) || 'spartan3e';
  const seen = new Map();
  for (const [jsonPath, doc] of entries) {
    const sch = jsonPath.replace(/\.sch\.json$/i, '.sch');
    const dir = sch.includes('/') ? sch.replace(/\/[^/]*$/, '/') : '';
    const role = (project.files.find(f => f.path === doc.generatedFile) || {}).role || 'design';
    let r;
    try { r = exportIseSch(doc, { modules, family, lang: langOfPath(doc.generatedFile) }); }
    catch (e) { res.warnings.push(`${jsonPath}: not exported as an ISE schematic (${e.message}); ${doc.generatedFile} is exported instead`); continue; }
    res.schematics.push({ path: sch, hdl: doc.generatedFile, role });
    res.files.push({ path: sch, text: r.xml });
    for (const f of r.files) {
      const p = dir + f.path;
      if (seen.has(p)) {
        if (seen.get(p) !== f.text) res.warnings.push(`${sch}: custom symbol ${f.path} differs from the one of another schematic with the same name; only the first was exported (rename one of the HDL blocks)`);
        continue;
      }
      seen.set(p, f.text);
      res.files.push({ path: p, text: f.text });
      if (f.kind === 'hdl') res.extraFiles.push({ path: p, lang: langOfPath(p), role: 'design' });
    }
    res.warnings.push(...r.warnings.map(w => `${sch}: ${w}`));
  }
  return res;
}
