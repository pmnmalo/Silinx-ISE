// Silinx - a project's constraints in its family's format: UCF, the iCE40's PCF (#2296) or the 7-series' XDC (#3142). The
// interface's model is parseUcf's: a bus's bit written x<1>, as PCF and XDC write x[1]; PCF's own text stays nextpnr's.
import { PCF, XDC, constraintsExtOf, constraintsFormatOf, generateUcf, parseUcf } from '/packages/silinx-fpga/src/parts.js';

export const constraintsExt = device => constraintsExtOf(device);

const toModel = net => net.replace(/\[(\d+)\]$/, '<$1>');
const toPcf = net => net.replace(/<(\d+)>$/, '[$1]');
const renamed = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));

/** The pins of a constraints text: { assignments, clocks, other }. */
export function readPins(device, text, opts) {
  const format = constraintsFormatOf(device);
  if (format === 'ucf') return parseUcf(text, opts);
  if (format === 'xdc') return XDC.read(text);   // (its reader writes the model's names, x<1>)
  const m = PCF.read(text);
  return { ...m, assignments: renamed(m.assignments, toModel), clocks: m.clocks.map(c => ({ ...c, net: toModel(c.net) })) };
}

/** The text of the pins, generateUcf's arguments. */
export function writePins(device, { assignments = {}, clocks = [], header, ...rest }) {
  const format = constraintsFormatOf(device);
  if (format === 'ucf') return generateUcf({ assignments, clocks, header, ...rest });
  if (format === 'xdc') return `${header ? `# ${header}\n` : ''}${XDC.write({ assignments, clocks, ...rest })}`;
  const body = PCF.write({ assignments: renamed(assignments, toPcf), clocks: clocks.map(c => ({ ...c, net: toPcf(c.net) })) });
  return `${header ? `# ${header}\n` : ''}${body}`;
}

/** A PCF's errors (the line nextpnr would stop at) and its nets that are no port of the top. */
export const pcfDiagnostics = (text, ports = []) => diagnostics(PCF, 'set_io', text, ports);
/** An XDC's errors (the line Vivado would stop at) and its ports that are no port of the top (#3142: Vivado's [Common 17-55]). */
export const xdcDiagnostics = (text, ports = []) => diagnostics(XDC, 'get_ports', text, ports);

// a line's words, an XDC's get_ports objects among them: {led[0]}, { SW[0] }, clk]
const namesIn = line => [...line.split(/\s+/), ...line.split(/[\s;]+/).map(w => w.replace(/\]$/, '')),
  ...[...line.matchAll(/\{([^{}]*)\}/g)].flatMap(m => m[1].trim().split(/\s+/))];

function diagnostics(format, command, text, ports) {
  let model;
  try { model = format.read(text); } catch (e) {
    return [{ severity: 'error', line: +(/^line (\d+)/.exec(e.message)?.[1] || 1), message: e.message.replace(/^line \d+: /, '') }];
  }
  if (!ports.length) return [];
  const known = new Set(ports.flatMap(p => (p.width > 1 ? Array.from({ length: p.width }, (_, i) => `${p.name}<${Math.min(p.msb, p.lsb) + i}>`) : [p.name])));
  const lines = String(text).split(/\r?\n/);
  const nets = format === XDC ? [...model.netStatements.map(n => n.net), ...model.clocks.map(c => c.net)] : Object.keys(model.assignments);
  return [...new Set(nets)].filter(n => !known.has(toModel(n))).map(n => ({
    severity: 'warning', message: `${command} ${toPcf(n)}: the top has no such port`,
    line: lines.findIndex(l => namesIn(l).includes(toPcf(n))) + 1,
  }));
}

/** A device's change of format: the project's constraints another file, nothing converted, the user told. */
export function constraintsForDevice(pj, fileTree, log) {
  const ext = constraintsExt(pj.device), old = pj.constraints;
  if (!old || old.toLowerCase().endsWith(ext)) return;
  pj.constraints = old.replace(/\.[^./]*$/, '') + ext;
  if (fileTree.includes(old)) log(`WARNING: this device's constraints are ${ext.slice(1).toUpperCase()}: ${pj.constraints} is the project's now, ${old} was not converted.`, 'warn');
}
