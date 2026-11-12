// Silinx toolchain - the 7-series' constraints, XDC (#3142), as Vivado reads them: a format of constraints.js's model.
//   set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {led[0]}]   a port's pin and its properties
//   set_property PACKAGE_PIN W5 [get_ports clk]                                     one property (LOC is PACKAGE_PIN's alias)
//   create_clock -add -name clk -period 10.000 -waveform {0.000 5.000} [get_ports {clk}]   a clock's period
//   set_property CFGBVS VCCO [current_design]                                       the design's (the board's) configuration
// '#' starts a comment, ';' ends a command. The model's bits are written x<1> (UCF's), XDC's x[1]. Any other command is
// kept as it is (the model's `other`, for Vivado): XDC is Tcl, and only these are portable.
// A line for a port the design does not have makes Vivado warn ("[Common 17-55] 'set_property' expects at least one
// object"): writeXdc leaves out the nets of the ports synthesis removed, given the ports it kept.
import { byName, periodNs, setByName } from './ucf.js';

const PULLS = { PULLUP: 'up', PULLDOWN: 'down', KEEPER: 'keeper' };
const PULL_TYPE = { up: 'PULLUP', down: 'PULLDOWN', keeper: 'KEEPER' };
const toModel = net => net.replace(/\[(\d+)\]$/, '<$1>');
const toXdc = net => net.replace(/<(\d+)>$/, '[$1]');
const num = x => (+x).toFixed(3);

// a command's words, Tcl's way enough for XDC: {…} and […] one word each (nested), "…" a string
function words(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    while (/\s/.test(text[i] || '')) i++;
    if (i >= text.length) break;
    const open = text[i], close = { '{': '}', '[': ']' }[open];
    if (close) {
      let depth = 0, j = i;
      for (; j < text.length; j++) {
        if (text[j] === open) depth++;
        else if (text[j] === close && --depth === 0) break;
      }
      if (j >= text.length) throw new Error(`no closing ${close}`);
      out.push({ text: text.slice(i + 1, j), kind: open });
      i = j + 1;
    } else if (open === '"') {
      const j = text.indexOf('"', i + 1);
      if (j < 0) throw new Error('no closing "');
      out.push({ text: text.slice(i + 1, j), kind: '"' });
      i = j + 1;
    } else {
      let j = i;
      while (j < text.length && !/\s/.test(text[j])) j++;
      out.push({ text: text.slice(i, j), kind: '' });
      i = j;
    }
  }
  return out;
}

// the objects of [get_ports …]: its names (braced or not); null when the object is not ports
function portsOf(w) {
  if (w?.kind !== '[') return null;
  const [cmd, ...args] = words(w.text);
  if (cmd?.text !== 'get_ports') return null;
  return args.filter(a => !a.text.startsWith('-')).flatMap(a => (a.kind === '{' ? a.text.trim().split(/\s+/) : [a.text])).filter(Boolean);
}

// a property of a port, in the model's terms
function portProperty(attrs, name, value, fail) {
  const key = name.toUpperCase(), v = String(value);
  if (key === 'PACKAGE_PIN' || key === 'LOC') attrs.loc = v.toUpperCase();
  else if (key === 'IOSTANDARD') attrs.iostandard = v.toUpperCase();
  else if (key === 'DRIVE') {
    if (!/^\d+$/.test(v)) fail(`DRIVE ${v}: a number of mA`);
    attrs.drive = +v;
  } else if (key === 'SLEW') {
    if (!/^(slow|fast)$/i.test(v)) fail(`SLEW ${v}: SLOW or FAST`);
    attrs.slew = v.toLowerCase();
  } else if (key === 'PULLTYPE') {
    if (!PULLS[v.toUpperCase()]) fail(`PULLTYPE ${v}: PULLUP, PULLDOWN or KEEPER`);
    attrs.pull = PULLS[v.toUpperCase()];
  } else if (PULLS[key]) {
    if (/^(true|1)$/i.test(v)) attrs.pull = PULLS[key];
  } else return false;
  return true;
}

// one command (its words); returns false when it is not one of the portable ones
function command(m, ws, fail) {
  const [cmd, ...args] = ws;
  if (cmd.text === 'set_property') {
    const dict = args[0]?.text === '-dict';
    const objects = portsOf(args[2]);
    if (dict) {
      if (args.length !== 3 || args[1].kind !== '{') fail('set_property -dict needs { name value … } and its objects');
      if (!objects) return false;
      const kv = words(args[1].text).map(w => w.text);
      if (kv.length % 2) fail('set_property -dict: a property without its value');
      const attrs = {};
      const pairs = Array.from({ length: kv.length / 2 }, (_, k) => [kv[2 * k], kv[2 * k + 1]]);
      if (!pairs.every(([k, v]) => portProperty(attrs, k, v, fail))) return false;
      for (const net of objects) setPort(m, net, attrs);
      return true;
    }
    if (args.length !== 3) fail('set_property needs a property, its value and its objects');
    if (args[2].kind === '[' && words(args[2].text)[0]?.text === 'current_design') {
      setByName(m.config, args[0].text.toUpperCase(), args[1].text);
      return true;
    }
    if (!objects) return false;
    const attrs = {};
    if (!portProperty(attrs, args[0].text, args[1].text, fail)) return false;
    for (const net of objects) setPort(m, net, attrs);
    return true;
  }
  if (cmd.text === 'create_clock') {
    const c = {};
    let objects = null;
    for (let k = 0; k < args.length; k++) {
      const a = args[k].text;
      if (a === '-add') continue;
      if (a === '-period') c.period = Number(args[++k]?.text);
      else if (a === '-name') c.name = args[++k]?.text;
      else if (a === '-waveform') c.waveform = (args[++k]?.text || '').trim().split(/\s+/).map(Number);
      else if (a.startsWith('-')) return false;
      else objects = portsOf(args[k]);
    }
    if (!(c.period > 0)) fail('create_clock needs -period, in ns');
    if (!objects?.length) return false;   // (a clock of a net or a pin: Vivado's own)
    const [rise = 0, fall = c.period / 2] = c.waveform || [];
    for (const net of objects) {
      m.clocks.push({ net: toModel(net), period: c.period, duty: +((100 * (fall - rise)) / c.period).toFixed(3), ...(c.name ? { name: c.name } : {}) });
    }
    return true;
  }
  return false;
}

function setPort(m, net, attrs) {
  const n = toModel(net);
  m.netStatements.push({ net: n, attrs: { ...attrs } });
  setByName(m.assignments, n, { ...byName(m.assignments, n), ...attrs });
}

/** The model of an XDC text: { assignments, netStatements, clocks, config, other }. Throws 'line N: …' where Vivado would stop. */
export function readXdc(text) {
  const m = { assignments: {}, netStatements: [], clocks: [], config: {}, other: [] };
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const fail = msg => { throw new Error(`line ${i + 1}: ${msg}`); };
    // (a '#' starts a comment at a command's start: after a ';' too)
    for (const part of raw.split(';')) {
      const cmd = part.trim();
      if (!cmd || cmd.startsWith('#')) {
        if (cmd.startsWith('#')) break;
        continue;
      }
      try {
        if (!command(m, words(cmd), fail)) m.other.push(cmd);
      } catch (e) { throw /^line \d+: /.test(e.message) ? e : new Error(`line ${i + 1}: ${e.message}`); }
    }
  });
  return m;
}

// the bit names of the ports, as the model writes them: x<1>, a scalar x
function portBits(ports) {
  const bits = new Set();
  for (const p of ports) {
    const width = p.width || 1;
    if (width === 1 && (p.msb === null || p.msb === undefined)) { bits.add(p.name); continue; }
    const lo = Math.min(p.msb ?? width - 1, p.lsb ?? 0);
    for (let i = 0; i < width; i++) bits.add(`${p.name}<${lo + i}>`);
  }
  return bits;
}

// a pin's I/O standard: its own, else the board's for that pin (Vivado has no default: NSTD-1 at write_bitstream)
function iostandardOf(a, board) {
  if (a.iostandard) return a.iostandard;
  const loc = String(a.loc || '').toUpperCase();
  const r = board?.resources?.find(x => x.pins.some(p => String(p).toUpperCase() === loc));
  return r?.pinIostandards?.[loc] || r?.iostandard || null;   // (pinIostandards: a pin of a bank of another voltage)
}

/**
 * The XDC of a constraints model ({ assignments, clocks, config?, other? }: bits x<1>).
 *   ports   the ports the design keeps ([{ name, width, msb, lsb }]): the other nets are left out (skipped); none: all written
 *   board   the board (its resources' I/O standards, for a pin without one; its xdc.config, the configuration's properties)
 *   header  the comment at the top
 * Returns { text, skipped }: skipped, the model's nets (pins and clocks) that are no port the design keeps, in order.
 */
export function writeXdc(model, { ports, board, header } = {}) {
  const { assignments = {}, clocks = [], config = {}, other = [] } = model || {};
  const keep = ports ? portBits(ports) : null;
  const skipped = [];
  const kept = net => {
    if (!keep || keep.has(net)) return true;
    if (!skipped.includes(net)) skipped.push(net);
    return false;
  };
  const lines = header ? header.split('\n').map(h => `# ${h}`.trimEnd()) : [];
  if (lines.length) lines.push('');
  const pins = [];
  for (const [net, a] of Object.entries(assignments)) {
    if (!a || !kept(net)) continue;
    const io = iostandardOf(a, board);
    const props = [a.loc && ['PACKAGE_PIN', a.loc], io && ['IOSTANDARD', io], PULL_TYPE[a.pull] && ['PULLTYPE', PULL_TYPE[a.pull]],
      a.drive && ['DRIVE', a.drive], a.slew && ['SLEW', String(a.slew).toUpperCase()]].filter(Boolean);
    if (props.length) pins.push(`set_property -dict { ${props.flat().join(' ')} } [get_ports {${toXdc(net)}}]`);
  }
  lines.push(...pins);
  const clockLines = clocks.filter(c => kept(c.net)).map(c => {
    const ns = periodNs(c.period), duty = c.duty ?? 50;
    const name = c.name || toXdc(c.net).replace(/\W/g, '_');
    return `create_clock -add -name ${name} -period ${num(ns)} -waveform {0.000 ${num((ns * duty) / 100)}} [get_ports {${toXdc(c.net)}}]`;
  });
  if (clockLines.length) lines.push(...(pins.length ? [''] : []), '# Timing constraints', ...clockLines);
  const cfg = Object.entries({ ...board?.xdc?.config, ...config });
  if (cfg.length) lines.push('', '# Configuration', ...cfg.map(([k, v]) => `set_property ${k} ${v} [current_design]`));
  if (other.length) lines.push('', ...other);
  return { text: lines.length ? `${lines.join('\n').replace(/^\n+/, '')}\n` : '', skipped };
}

export const XDC = { id: 'xdc', read: text => readXdc(text), write: model => writeXdc(model).text };
