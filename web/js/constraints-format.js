// Silinx - a project's constraints in its family's format: UCF, the iCE40's PCF (#2296), the ECP5's LPF (#2302), the Gowin's CST
// (#2303) or the 7-series' XDC (#3142). The interface's model is parseUcf's: a bus's bit written x<1>, as PCF, LPF and XDC write x[1]; PCF's and LPF's
// own text stays nextpnr's.
import { PCF, LPF, CST, XDC, constraintsExtOf, constraintsFormatOf, generateUcf, parseUcf } from '/packages/silinx-fpga/src/parts.js';
import { constraintsDiagnostics } from '/core/constraints-check.js';

export const constraintsExt = device => constraintsExtOf(device);

const toModel = net => net.replace(/\[(\d+)\]$/, '<$1>');
const toPcf = net => net.replace(/<(\d+)>$/, '[$1]');
// the formats nextpnr reads, its names (x[1])
const NEXTPNR = { pcf: PCF, lpf: LPF, cst: CST };
const renamed = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));

/** The pins of a constraints text: { assignments, clocks, other }. */
export function readPins(device, text, opts) {
  const format = constraintsFormatOf(device);
  if (format === 'ucf') return parseUcf(text, opts);
  if (format === 'xdc') return XDC.read(text);   // (its reader writes the model's names, x<1>)
  const m = NEXTPNR[format].read(text);
  return { ...m, assignments: renamed(m.assignments, toModel), clocks: m.clocks.map(c => ({ ...c, net: toModel(c.net) })) };
}

/** The text of the pins, generateUcf's arguments. */
export function writePins(device, { assignments = {}, clocks = [], header, ...rest }) {
  const format = constraintsFormatOf(device);
  if (format === 'ucf') return generateUcf({ assignments, clocks, header, ...rest });
  if (format === 'xdc') return `${header ? `# ${header}\n` : ''}${XDC.write({ assignments, clocks, ...rest })}`;
  const body = NEXTPNR[format].write({ assignments: renamed(assignments, toPcf), clocks: clocks.map(c => ({ ...c, net: toPcf(c.net) })), ...rest });
  return `${header ? `${NEXTPNR[format].comment || '#'} ${header}\n` : ''}${body}`;
}

// (the checks: core/constraints-check.js, the MCP server's too; opts: { top, device, board }, #2296)
/** A PCF's errors (the line nextpnr would stop at, its pins: of the package, once each), its nets that are no port of the top, its pins on no resource of the board. */
export const pcfDiagnostics = (text, ports = [], opts) => constraintsDiagnostics('pcf', text, { ports, ...opts });
/** An LPF's errors (the statement nextpnr-ecp5 would not apply, a pin's, an I/O standard at another voltage than its bank's on the board) and warnings (#2302). */
export const lpfDiagnostics = (text, ports = [], opts) => constraintsDiagnostics('lpf', text, { ports, ...opts });
/** A CST's errors (the statement nextpnr-himbaechel-gowin would not apply, a pin's, an I/O standard at another voltage than its bank's) and warnings (#2303). */
export const cstDiagnostics = (text, ports = [], opts) => constraintsDiagnostics('cst', text, { ports, ...opts });
/** An XDC's errors (the line Vivado would stop at) and its ports that are no port of the top (#3142: Vivado's [Common 17-55]). */
export const xdcDiagnostics = (text, ports = [], opts) => constraintsDiagnostics('xdc', text, { ports, ...opts });

/** A device's change of format: the project's constraints another file, nothing converted, the user told. */
export function constraintsForDevice(pj, fileTree, log) {
  const ext = constraintsExt(pj.device), old = pj.constraints;
  if (!old || old.toLowerCase().endsWith(ext)) return;
  pj.constraints = old.replace(/\.[^./]*$/, '') + ext;
  if (fileTree.includes(old)) log(`WARNING: this device's constraints are ${ext.slice(1).toUpperCase()}: ${pj.constraints} is the project's now, ${old} was not converted.`, 'warn');
}
