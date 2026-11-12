// Silinx - the checks of the constraints of the families nextpnr implements (#2296): a PCF (iCE40), an LPF (ECP5), a CST
// (Gowin) and an XDC (7-series, #3142), as Check Constraints, the editor's live check and the Constraints Wizard make them,
// in the interface (web/js/constraints-format.js) and in the MCP server (server/mcp-constraints.js); a UCF's are ucf.js
// checkUcf's. What each format writes of a pin (PIN_ATTRS: its I/O standards, drive, slew, pull) and the checks:
//   error    the line the back end would stop at; a pin that is no pin of the device's package; a pin given to two ports;
//            an I/O standard of another voltage than its bank's on the board; a drive or a slew the family has not
//   warning  a name that is no port of the top; a pin on no resource of the board; an I/O standard Silinx does not know
//            of the family; the ports with no pin (when the top is known), as checkUcf's
// The names are the interface's model's (x<1>), nextpnr's in the messages (x[1]).
import { PCF, LPF, CST, XDC, constraintsFormatOf } from '../packages/silinx-fpga/src/parts.js';

const FORMATS = { pcf: PCF, lpf: LPF, cst: CST, xdc: XDC };
// a format's command that places a port: the messages'
export const PIN_COMMAND = { pcf: 'set_io', lpf: 'LOCATE COMP', cst: 'IO_LOC', xdc: 'get_ports' };
// the keyword of an I/O standard, a drive and a slew in the messages
const KEYS = { lpf: { iostandard: 'IO_TYPE', drive: 'DRIVE', slew: 'SLEWRATE' }, cst: { iostandard: 'IO_TYPE', drive: 'DRIVE' } };

// the I/O standards nextpnr-ecp5 (ecp5/iotypes.inc) and Apicula (the Gowin's IO_TYPE) take: an unknown one warned
const ECP5_IO = ['LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'LVCMOS10', 'LVTTL33', 'LVCMOS33D', 'LVCMOS25D', 'LVDS', 'BLVDS25', 'MLVDS25',
  'LVPECL33', 'SLVS', 'SUBLVDS', 'HSUL12', 'HSUL12D', 'SSTL18_I', 'SSTL18_II', 'SSTL18D_I', 'SSTL18D_II', 'SSTL15_I', 'SSTL15_II', 'SSTL15D_I',
  'SSTL15D_II', 'SSTL135_I', 'SSTL135_II', 'SSTL135D_I', 'SSTL135D_II'];
const GOWIN_IO = ['LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'LVCMOS10', 'LVTTL33', 'PCI33', 'SSTL15', 'SSTL18_I', 'SSTL18_II', 'SSTL25_I',
  'SSTL25_II', 'SSTL33_I', 'SSTL33_II', 'HSTL15_I', 'HSTL18_I', 'HSTL18_II', 'LVDS25', 'LVDS25E', 'BLVDS25', 'BLVDS25E', 'MLVDS25', 'MLVDS25E', 'RSDS',
  'RSDS25E', 'LVPECL33', 'LVPECL33E', 'LVCMOS33D', 'LVCMOS25D', 'LVCMOS18D', 'LVCMOS15D', 'LVCMOS12D'];

/** What a format writes of a pin, I/O Pin Planning's columns and the wizard's: null, the format has none; the pulls
 *  ('' none); the clock's frequency (clock: the format writes it). The UCF's and the XDC's are the family's (ioStandards). */
export const PIN_ATTRS = {
  ucf: { iostandard: 'family', drive: ['2', '4', '6', '8', '12', '16', '24'], slew: ['slow', 'fast', 'quietio'], pull: ['up', 'down', 'keeper'], clock: true },
  xdc: { iostandard: 'family', drive: ['2', '4', '6', '8', '12', '16', '24'], slew: ['slow', 'fast', 'quietio'], pull: ['up', 'down', 'keeper'], clock: true },
  // (the iCE40's I/O standard is SB_LVCMOS, its bank's voltage: a PCF has none; a pull-up only, set_io -pullup yes)
  pcf: { iostandard: null, drive: null, slew: null, pull: ['up'], clock: true },
  lpf: { iostandard: ECP5_IO, drive: ['4', '8', '12', '16'], slew: ['slow', 'fast'], pull: ['up', 'down', 'keeper'], clock: true },
  // (a CST's clock: Silinx's create_clock in a comment, given to nextpnr, cst.js)
  cst: { iostandard: GOWIN_IO, drive: ['4', '8', '12', '16', '24'], slew: null, pull: ['up', 'down', 'keeper'], clock: true },
};
/** A device's: its format's attributes. */
export const pinAttrsOf = device => PIN_ATTRS[constraintsFormatOf(device)];

/** The voltage of an I/O standard (LVCMOS18: 1.8, SSTL135_I: 1.35), null for one with no single voltage (LVDS, SB_LVCMOS). */
export function standardVolts(std) {
  const s = String(std || '').toUpperCase();
  let m = /^(?:LVCMOS|LVTTL)(\d)(\d)D?$/.exec(s);
  if (m) return +`${m[1]}.${m[2]}`;
  if (s === 'LVTTL') return 3.3;
  m = /^(?:SSTL|HSTL|HSUL)(\d)(\d+)D?(?:_|$)/.exec(s);
  return m ? +`${m[1]}.${m[2]}` : null;
}

/** The error of a pin that is no pin of the package, or null: a QFN's and a QFP's are numbered (SG48: 1..48), a BGA's balls a
 *  row and a column (A1, B12, AA3). A package of another form: no check. */
export function packagePinError(pin, pkg) {
  const p = String(pin), k = String(pkg || '').toLowerCase();
  const balls = /^(qn84|cm|cb|bg|ct|uwg|swg|cabga|csfbga|mg|pg|ug|ub)/.test(k);
  const numbered = !balls && /^(sg|qn|tq|vq|lq|eq|pq|tqfp)(\d+)/.exec(k);
  if (numbered) return /^\d+$/.test(p) && +p >= 1 && +p <= +numbered[2] ? null : `${p} is not a pin of the ${k} package (1…${numbered[2]})`;
  if (balls) return /^[A-Z]{1,2}\d{1,2}$/i.test(p) ? null : `${p} is not a pin of the ${k} package (its balls look like A1, B12, AA3)`;
  return null;
}

const toModel = net => net.replace(/\[(\d+)\]$/, '<$1>');
const toNextpnr = net => net.replace(/<(\d+)>$/, '[$1]');
// a line's words, an XDC's get_ports objects among them: {led[0]}, { SW[0] }, clk]
const namesIn = line => [...line.split(/\s+/), ...[...line.matchAll(/"([^"]*)"/g)].map(m => m[1]), ...line.split(/[\s;]+/).map(w => w.replace(/\]$/, '')),
  ...[...line.matchAll(/\{([^{}]*)\}/g)].flatMap(m => m[1].trim().split(/\s+/))];
// the bits of the ports, the model's names: x, x<0>…
const bitsOf = ports => ports.flatMap(p => (p.width > 1 || (p.msb !== null && p.msb !== undefined)
  ? Array.from({ length: p.width || 1 }, (_, i) => `${p.name}<${Math.min(p.msb ?? 0, p.lsb ?? 0) + i}>`) : [p.name]));
// a board's pins: { PIN: { label, standard } }
function boardPins(board) {
  const m = new Map();
  for (const r of board?.resources || []) r.pins.forEach((pin, i) => m.set(String(pin).toUpperCase(), { label: r.pins.length > 1 ? `${r.name}<${i}>` : r.name, standard: r.pinIostandards?.[pin] || r.iostandard }));
  return m;
}

/** The diagnostics of a constraints text of format `id` (pcf, lpf, cst, xdc): [{ severity, line, message }].
 *  ports: the top's (ucfPort's: name, width, msb, lsb), its names checked; top: its name, the ports with no pin warned;
 *  device: its package's pins checked; board: its resources' pins and their banks' voltages. */
export function constraintsDiagnostics(id, text, { ports = [], top = null, device = null, board = null } = {}) {
  const format = FORMATS[id];
  let model;
  try { model = format.read(text); } catch (e) {
    return [{ severity: 'error', line: +(/^line (\d+)/.exec(e.message)?.[1] || 1), message: e.message.replace(/^line \d+: /, '') }];
  }
  const out = [], lines = String(text).split(/\r?\n/), command = PIN_COMMAND[id];
  const lineOf = net => lines.findIndex(l => namesIn(l).includes(net)) + 1;
  if (id !== 'xdc') out.push(...pinDiagnostics(id, model, { device, board, lineOf }));
  if (ports.length) {
    const known = new Set(bitsOf(ports));
    const nets = id === 'xdc' ? [...model.netStatements.map(n => n.net), ...model.clocks.map(c => c.net)] : Object.keys(model.assignments);
    for (const n of [...new Set(nets)].filter(x => !known.has(toModel(x)))) out.push({ severity: 'warning', message: `${command} ${toNextpnr(n)}: the top has no such port`, line: lineOf(toNextpnr(n)) });
    // (as checkUcf: only when the file places pins at all)
    const placed = new Set(Object.entries(model.assignments || {}).filter(([, a]) => a?.loc).map(([n]) => toModel(n)));
    const missing = [...known].filter(n => !placed.has(n));
    if (top && id !== 'xdc' && placed.size && missing.length) {
      out.push({ severity: 'warning', line: Math.max(1, lines.length - (String(text).endsWith('\n') ? 1 : 0)),
        message: `${missing.length} port bit(s) of '${top}' have no pin (${command}): ${missing.slice(0, 10).map(toNextpnr).join(', ')}${missing.length > 10 ? ', …' : ''}` });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

// the pins of a PCF's, an LPF's or a CST's model: of the package, once each, on the board, at its bank's voltage; the
// attributes the family has
function pinDiagnostics(id, model, { device, board, lineOf }) {
  const out = [], attrs = PIN_ATTRS[id], keys = KEYS[id] || {}, onBoard = board ? boardPins(board) : null;
  const taken = new Map();
  for (const st of model.netStatements) {
    const net = st.net, a = st.attrs || {}, line = st.line || lineOf(net);
    const err = message => out.push({ severity: 'error', line, message }), warn = message => out.push({ severity: 'warning', line, message });
    if (a.loc) {
      const pin = String(a.loc).toUpperCase(), bad = device && packagePinError(a.loc, device.package);
      if (bad) err(`${PIN_COMMAND[id]} ${net}: ${bad}`);
      const prev = taken.get(pin);
      if (prev && prev.net !== net) err(`${PIN_COMMAND[id]} ${net}: the pin ${a.loc} is given to ${prev.net} too (line ${prev.line})`);
      else taken.set(pin, { net, line });
      if (!bad && onBoard && !onBoard.has(pin)) warn(`${PIN_COMMAND[id]} ${net}: the pin ${a.loc} is on no resource of the ${board.name}`);
    }
    if (a.iostandard && keys.iostandard) {
      const std = String(a.iostandard).toUpperCase();
      if (Array.isArray(attrs.iostandard) && !attrs.iostandard.includes(std)) warn(`${keys.iostandard}=${a.iostandard} of ${net}: not an I/O standard Silinx knows of the ${id === 'lpf' ? 'ECP5' : 'Gowin'} (${attrs.iostandard.slice(0, 6).join(', ')}…)`);
    }
    if (a.drive !== undefined && keys.drive && !attrs.drive.includes(String(a.drive))) err(`${keys.drive}=${a.drive} of ${net}: ${attrs.drive.slice(0, -1).join(', ')} or ${attrs.drive.at(-1)} mA`);
    if (a.slew && keys.slew && !attrs.slew.includes(String(a.slew).toLowerCase())) err(`${keys.slew}=${a.slew} of ${net}: ${attrs.slew.map(s => s.toUpperCase()).join(' or ')}`);
  }
  // an I/O standard at its bank's voltage: the board's for its pin (the last statements', as the back end reads them)
  if (onBoard && keys.iostandard) {
    for (const [net, a] of Object.entries(model.assignments)) {
      const on = a?.loc && onBoard.get(String(a.loc).toUpperCase());
      const want = standardVolts(on?.standard), got = standardVolts(a?.iostandard);
      if (want === null || got === null || want === got) continue;
      const st = model.netStatements.findLast(s => s.net === net && s.attrs?.iostandard);
      out.push({ severity: 'error', line: st?.line || lineOf(net),
        message: `${keys.iostandard}=${a.iostandard} of ${net}: the pin ${a.loc} (${on.label}) is in a bank at ${want} V on the ${board.name} (${on.standard}), not ${got} V` });
    }
  }
  return out;
}
