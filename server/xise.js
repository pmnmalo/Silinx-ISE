// ISE 14.7 Project Navigator project file (.xise) export / import.
//
// Format checked against .xise files saved by ISE 14.7 (schema_version 2): root
// <project xmlns="http://www.xilinx.com/XMLSchema" xmlns:xil_pn="http://www.xilinx.com/XMLSchema">
// with <header>, <version>, <files>, <properties>, <bindings/>, <libraries/>, <autoManagedFiles>.
// Only the properties that differ from ISE defaults are written; ISE fills in the rest on open.
// Top-level values use ISE's "Module|name" (Verilog) / "Architecture|entity|arch" (VHDL) syntax.

import { FAMILY_INFO, deviceFamily, familyFromXise, familyOfPart, familyName } from '../core/family.js';

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
 * @param {object} project  XAIlinx project json
 * @param {object} [opts]   { sources: { path: text } } (optional, used to detect VHDL architectures / top files)
 */
export function exportXise(project, { sources } = {}) {
  const dev = project.device || {};
  const impl = project.impl || {};
  const files = project.files || [];
  const lines = [XML_HEADER, '<project xmlns="http://www.xilinx.com/XMLSchema" xmlns:xil_pn="http://www.xilinx.com/XMLSchema">', ''];
  lines.push('  <header>',
    '    <!-- ISE source project file exported by XAIlinx.                     -->',
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
  if (project.constraints) {
    lines.push(`    <file xil_pn:name="${esc(project.constraints)}" xil_pn:type="FILE_UCF">`,
      '      <association xil_pn:name="Implementation" xil_pn:seqID="0"/>', '    </file>');
  }
  lines.push('  </files>', '');

  const top = project.top ? topValue(project, project.top, sources) : null;
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
 * Parse .xise XML into a partial XAIlinx project:
 * { device, top, simTop, files:[{path,lang,role}], constraints, impl, name? }
 */
export function importXise(xml) {
  const text = String(xml || '').replace(/<!--[\s\S]*?-->/g, '');
  if (!/<project\b/.test(text)) throw Object.assign(new Error('not an ISE .xise project file (no <project> element)'), { status: 400 });

  const files = [];
  let constraints = null;
  const fileRe = /<file\b([^>]*?)(\/>|>([\s\S]*?)<\/file>)/g;
  let m;
  while ((m = fileRe.exec(text))) {
    const a = attrs(m[1]);
    const name = (a.name || '').replace(/\\/g, '/');
    const type = (a.type || '').toUpperCase();
    const assoc = [...(m[3] || '').matchAll(/<association\b([^>]*)\/?>/g)].map(x => attrs(x[1]).name);
    if (type === 'FILE_UCF' || /\.ucf$/i.test(name)) { if (!constraints) constraints = name; continue; }
    const lang = type === 'FILE_VHDL' || /\.vhdl?$/i.test(name) ? 'vhdl' : type === 'FILE_VERILOG' || /\.(v|sv)$/i.test(name) ? 'verilog' : null;
    if (!lang) continue;
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
  if (fam && !familyFromXise(fam)) warnings.push(`device family '${fam}' is not an FPGA family supported by XAIlinx (${familyName(device.family)} assumed)`);

  const top = unitName(props['Implementation Top']) || (props['Implementation Top Instance Path'] || '').replace(/^\//, '') || '';
  const simTop = unitName(props['PROP_BehavioralSimTop']) || unitName(props['Selected Simulation Root Source Node Behavioral']) || '';
  const impl = {
    optMode: /area/i.test(props['Optimization Goal'] || '') ? 'Area' : 'Speed',
    optLevel: /high/i.test(props['Optimization Effort'] || '') ? 2 : 1,
    startupClk: /cclk/i.test(props['FPGA Start-Up Clock'] || '') ? 'Cclk' : /user/i.test(props['FPGA Start-Up Clock'] || '') ? 'UserClk' : 'JtagClk',
  };
  const out = { device, top, simTop, files, constraints, impl, warnings };
  if (props['PROP_DesignName']) out.name = props['PROP_DesignName'];
  return out;
}
