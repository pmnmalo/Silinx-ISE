// Silinx - a project's constraints in its family's format: UCF, or the iCE40's PCF (#2296). The interface's model is
// parseUcf's: a bus's bit written x<1>, as PCF writes x[1]; PCF's own text stays nextpnr's.
import { PCF, generateUcf, openOnlyDevice, parseUcf } from '/packages/silinx-fpga/src/parts.js';

export const constraintsExt = device => (openOnlyDevice(device) ? '.pcf' : '.ucf');

const toModel = net => net.replace(/\[(\d+)\]$/, '<$1>');
const toPcf = net => net.replace(/<(\d+)>$/, '[$1]');
const renamed = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));

/** The pins of a constraints text: { assignments, clocks, other }. */
export function readPins(device, text, opts) {
  if (!openOnlyDevice(device)) return parseUcf(text, opts);
  const m = PCF.read(text);
  return { ...m, assignments: renamed(m.assignments, toModel), clocks: m.clocks.map(c => ({ ...c, net: toModel(c.net) })) };
}

/** The text of the pins, generateUcf's arguments. */
export function writePins(device, { assignments = {}, clocks = [], header, ...rest }) {
  if (!openOnlyDevice(device)) return generateUcf({ assignments, clocks, header, ...rest });
  const body = PCF.write({ assignments: renamed(assignments, toPcf), clocks: clocks.map(c => ({ ...c, net: toPcf(c.net) })) });
  return `${header ? `# ${header}\n` : ''}${body}`;
}

/** A PCF's errors (the line nextpnr would stop at) and its nets that are no port of the top. */
export function pcfDiagnostics(text, ports = []) {
  let model;
  try { model = PCF.read(text); } catch (e) {
    return [{ severity: 'error', line: +(/^line (\d+)/.exec(e.message)?.[1] || 1), message: e.message.replace(/^line \d+: /, '') }];
  }
  if (!ports.length) return [];
  const known = new Set(ports.flatMap(p => (p.width > 1 ? Array.from({ length: p.width }, (_, i) => `${p.name}<${Math.min(p.msb, p.lsb) + i}>`) : [p.name])));
  const lines = String(text).split(/\r?\n/);
  return Object.keys(model.assignments).filter(n => !known.has(toModel(n))).map(n => ({
    severity: 'warning', message: `set_io ${n}: the top has no such port`,
    line: lines.findIndex(l => l.split(/\s+/).includes(n)) + 1,
  }));
}

/** A device's change of format: the project's constraints another file, nothing converted, the user told. */
export function constraintsForDevice(pj, fileTree, log) {
  const ext = constraintsExt(pj.device), old = pj.constraints;
  if (!old || old.toLowerCase().endsWith(ext)) return;
  pj.constraints = old.replace(/\.[^./]*$/, '') + ext;
  if (fileTree.includes(old)) log(`WARNING: this device's constraints are ${ext.slice(1).toUpperCase()}: ${pj.constraints} is the project's now, ${old} was not converted.`, 'warn');
}
