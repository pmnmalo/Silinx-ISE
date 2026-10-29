// Xilinx UCF (User Constraints File) generation and parsing.
//
// Isomorphic module: no Node APIs, imported both by the server and the browser.
//
// Bus naming convention: HDL port `led[7:0]`, bit 3  ->  UCF net `led<3>`.
//
// Assignment object (per net / per bit):
//   { loc: 'F12', iostandard: 'LVCMOS33', pull: 'up'|'down'|'keeper'|null,
//     drive: 8, slew: 'slow'|'fast'|'quietio', clockDedicatedRoute: false }
// Clock object:
//   { net: 'clk', period: 20 (ns, number or '20 ns'/'50 MHz' string), duty: 50, name: 'TS_clk' }

/**
 * The name XST gives a top-level port in its netlist, which is the one the UCF must use. A plain
 * identifier keeps its name. A name that is not one (a Verilog escaped identifier such as
 * `\opcode[0] `, a VHDL extended identifier) is put between underscores, with + . / \ ~ ^ * = % & $
 * replaced by '_'; the '$' of a plain Verilog identifier is replaced too. Measured with ISE 14.7:
 * `\opcode[0] ` -> `_opcode[0]_`, `\a.b ` -> `_a_b_`, `\1abc ` -> `_1abc_`, `b$c` -> `b_c`; the other
 * characters (- ( ) [ ] < > { } : ; # | @ ? ! ' ` , ") are kept. ngdbuild finds no NET `opcode[0]`,
 * `\opcode[0]`, `opcode\[0\]` or `b$c` (ConstraintSystem:59).
 */
export function ucfPortName(port) {
  const s = String(port);
  // a VHDL extended identifier (its name keeps the backslashes, core/vhdl/lexer.js) is always put
  // between underscores, its case kept, even when its text is a plain name: \Mixed\ -> _Mixed_,
  // \a.b\ -> _a_b_, \Bus\(1) -> _Bus_<1> (measured with ISE 14.7, #65)
  const ext = /^\\(.*)\\$/s.exec(s);
  if (ext) return `_${ext[1].replace(/\\\\/g, '\\').replace(/[+./\\~^*=%&$]/g, '_')}_`;
  return /^[A-Za-z_][\w$]*$/.test(s) ? s.replace(/\$/g, '_') : `_${s.replace(/[+./\\~^*=%&$]/g, '_')}_`;
}

/** UCF net name for one bit of a port (`bit` undefined/null for scalars). */
export function bitName(port, bit) {
  const n = ucfPortName(port);
  return bit === undefined || bit === null ? n : `${n}<${bit}>`;
}

/**
 * Normalise a port description to { name, dir, msb, lsb, width, bus }.
 * Accepts a string ('led', 'led[7:0]', 'led<7:0>') or an object
 * ({ name, dir?, width?, msb?, lsb?, range?:[msb,lsb] }).
 */
export function normalizePort(p) {
  if (typeof p === 'string') {
    const m = /^\s*([A-Za-z_][\w$]*)\s*(?:[[<]\s*(-?\d+)\s*:\s*(-?\d+)\s*[\]>])?\s*$/.exec(p);
    if (!m) throw new Error(`bad port spec '${p}'`);
    if (m[2] === undefined) return { name: m[1], msb: null, lsb: null, width: 1, bus: false };
    const msb = +m[2], lsb = +m[3];
    return { name: m[1], msb, lsb, width: Math.abs(msb - lsb) + 1, bus: true };
  }
  const name = p.name;
  let msb = p.msb ?? (Array.isArray(p.range) ? p.range[0] : null);
  let lsb = p.lsb ?? (Array.isArray(p.range) ? p.range[1] : null);
  if (msb === null && p.width > 1) { msb = p.width - 1; lsb = 0; }
  const bus = msb !== null && msb !== undefined && (p.bus !== false);
  if (!bus) return { name, dir: p.dir, msb: null, lsb: null, width: 1, bus: false };
  lsb ??= 0;
  return { name, dir: p.dir, msb, lsb, width: Math.abs(msb - lsb) + 1, bus: true };
}

/** All UCF net names of a port, LSB first. */
export function expandPort(p) {
  const n = normalizePort(p);
  if (!n.bus) return [bitName(n.name)];
  const out = [];
  const step = n.msb >= n.lsb ? 1 : -1;
  for (let i = n.lsb; ; i += step) { out.push(bitName(n.name, i)); if (i === n.msb) break; }
  return out;
}

/** Parse '20', '20 ns', '20ns', '50 MHz', '1.5 us' into nanoseconds (number). */
export function periodNs(v) {
  if (typeof v === 'number') return v;
  const m = /^\s*([\d.]+)\s*(ps|ns|us|ms|s|hz|khz|mhz|ghz)?\s*$/i.exec(String(v ?? ''));
  if (!m) throw new Error(`bad clock period '${v}'`);
  const x = parseFloat(m[1]);
  switch ((m[2] || 'ns').toLowerCase()) {
    case 'ps': return x / 1000;
    case 'ns': return x;
    case 'us': return x * 1e3;
    case 'ms': return x * 1e6;
    case 's': return x * 1e9;
    case 'hz': return 1e9 / x;
    case 'khz': return 1e6 / x;
    case 'mhz': return 1e3 / x;
    case 'ghz': return 1 / x;
  }
  return x;
}

const fmtNum = x => String(+x.toFixed(6));

// Net names that need no quoting are still always quoted in our output (ISE accepts both).
const q = s => `"${String(s).replace(/"/g, '')}"`;

function attrList(a) {
  const parts = [];
  if (a.loc) parts.push(`LOC = ${q(String(a.loc).toUpperCase())}`);
  if (a.iostandard) parts.push(`IOSTANDARD = ${String(a.iostandard).toUpperCase()}`);
  const pull = a.pull ? String(a.pull).toLowerCase() : '';
  if (pull === 'up' || pull === 'pullup') parts.push('PULLUP');
  else if (pull === 'down' || pull === 'pulldown') parts.push('PULLDOWN');
  else if (pull === 'keeper') parts.push('KEEPER');
  if (a.drive !== undefined && a.drive !== null && a.drive !== '') parts.push(`DRIVE = ${parseInt(a.drive, 10)}`);
  if (a.slew) parts.push(`SLEW = ${String(a.slew).toUpperCase()}`);
  return parts;
}

/**
 * Generate UCF text.
 * @param {object} o
 * @param {Array}  [o.ports]        ports in HDL order (strings or objects, see normalizePort). When
 *                                  given, nets are emitted in port order and unassigned bits are
 *                                  listed as comments; when omitted every assignment is emitted.
 * @param {object} o.assignments    { netName: assignment }
 * @param {Array}  [o.clocks]       [{ net, period, duty?, name? }]
 * @param {string} [o.header]       comment text placed at the top
 * @param {string[]} [o.other]      statements to keep verbatim (parseUcf(...).other: INST, OFFSET,
 *                                  TIMEGRP, derived TIMESPECs, unknown NET attributes...)
 */
export function generateUcf({ ports, assignments = {}, clocks = [], header, other = [] } = {}) {
  const lines = [];
  for (const h of (header ?? 'Generated by Silinx').split('\n')) lines.push(`# ${h}`.trimEnd());
  lines.push('');

  let nets;
  if (ports && ports.length) {
    nets = [];
    for (const p of ports) {
      const n = normalizePort(p);
      const bits = expandPort(n);
      // Allow a scalar assignment for a 1-bit bus declared as `x[0:0]` and vice versa.
      for (const b of bits) nets.push(b);
    }
    // Extra assignments not matching any port are still emitted (kept, but flagged).
    const known = new Set(nets);
    const extra = Object.keys(assignments).filter(k => !known.has(k));
    if (extra.length) nets.push(...extra.map(e => ({ extra: e })));
  } else {
    nets = Object.keys(assignments).sort(netCompare);
  }

  const w = Math.max(8, ...nets.map(n => (typeof n === 'string' ? n : n.extra).length + 2));
  for (const n of nets) {
    const name = typeof n === 'string' ? n : n.extra;
    const a = assignments[name];
    if (!a || !a.loc && !a.iostandard && !a.pull && !a.drive && !a.slew) {
      lines.push(`# NET ${q(name).padEnd(w)} LOC = "" ;  # unassigned`);
      continue;
    }
    const attrs = attrList(a);
    const suffix = typeof n === 'string' ? '' : '  # not a port of the top module';
    lines.push(`NET ${q(name).padEnd(w)} ${attrs.join(' | ')} ;${suffix}`);
    if (a.clockDedicatedRoute === false || a.clockDedicatedRoute === 'FALSE')
      lines.push(`NET ${q(name).padEnd(w)} CLOCK_DEDICATED_ROUTE = FALSE ;`);
  }

  if (clocks.length) {
    lines.push('', '# Timing constraints');
    for (const c of clocks) {
      const ns = periodNs(c.period);
      const duty = c.duty ?? 50;
      const tnm = c.tnm || String(c.net).replace(/[<>]/g, '_');
      const ts = c.name || `TS_${tnm}`;
      lines.push(`NET ${q(c.net)} TNM_NET = ${q(tnm)} ;`);
      lines.push(`TIMESPEC ${q(ts)} = PERIOD ${q(tnm)} ${fmtNum(ns)} ns HIGH ${duty}% ;`);
    }
  }
  const kept = (other || []).map(st => String(st).trim().replace(/;\s*$/, '').trim()).filter(Boolean);
  if (kept.length) {
    lines.push('', '# Other constraints (kept as written)');
    for (const st of kept) lines.push(`${st} ;`);
  }
  return lines.join('\n') + '\n';
}

/** Sort nets: by base name, then numeric bit index. */
function netCompare(a, b) {
  const ma = /^(.*?)(?:<(\d+)>)?$/.exec(a), mb = /^(.*?)(?:<(\d+)>)?$/.exec(b);
  if (ma[1] !== mb[1]) return ma[1].localeCompare(mb[1]);
  return (+(ma[2] ?? -1)) - (+(mb[2] ?? -1));
}

/** Split UCF text into statements (terminated by ';'), stripping '#' comments. */
function statements(text) {
  const clean = String(text).split(/\r?\n/).map(l => {
    // '#' starts a comment unless inside a quoted string.
    let inStr = false;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === '"') inStr = !inStr;
      else if (l[i] === '#' && !inStr) return l.slice(0, i);
    }
    return l;
  }).join('\n');
  const out = [];
  let cur = '', inStr = false;
  for (const ch of clean) {
    if (ch === '"') inStr = !inStr;
    if (ch === ';' && !inStr) { if (cur.trim()) out.push(cur.trim().replace(/\s+/g, ' ')); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim().replace(/\s+/g, ' '));
  return out;
}

const unq = s => s.trim().replace(/^"(.*)"$/, '$1');
// ngdbuild finds a bit of a bus port written a<0>, a(0) or a[0] (measured with ISE 14.7): the
// canonical a<0>. But a name such as opcode[1] may also be a port's HDL name (Verilog \opcode[1] ,
// netlist name _opcode[1]_, #34), not a bit: given the ports, only the bits of their buses are
// rewritten; anything else is kept as written (#63).
const BUS_BIT = /^([A-Za-z_][\w$]*)\s*[([]\s*(-?\d+)\s*[)\]]$/;
function busBitOf(ports) {
  if (!ports) return s => s.replace(BUS_BIT, '$1<$2>');
  const buses = new Set();
  for (const p of ports) { const n = normalizePort(p); if (n.bus) buses.add(ucfPortName(n.name).toLowerCase()); }
  return s => { const m = BUS_BIT.exec(s); return m && buses.has(m[1].toLowerCase()) ? `${m[1]}<${m[2]}>` : s; };
}

/**
 * Parse the remainder of a simple PERIOD spec: '20 ns HIGH 50%', '50 MHz', '20'. Anchored: derived
 * specs ('TS_clk / 2', 'TS_clk * 4 PHASE 1 ns') and anything with extra keywords return null.
 */
function parsePeriodSpec(s) {
  const m = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*(ps|ns|us|ms|mhz|khz|ghz|hz)?\s*(?:(HIGH|LOW)\s*(\d+(?:\.\d*)?)\s*%?)?\s*$/i.exec(String(s));
  if (!m) return null;
  const period = periodNs(`${m[1]} ${m[2] || 'ns'}`);
  if (!Number.isFinite(period) || period <= 0) return null;
  let duty = m[4] !== undefined ? parseFloat(m[4]) : 50;
  if (m[3] && m[3].toUpperCase() === 'LOW') duty = 100 - duty;
  return { period: +period.toFixed(6), duty };
}

/** Is `s` a valid PERIOD spec remainder (simple, or derived from another TIMESPEC, with optional jitter/priority)? */
function periodSpecOk(s) {
  let t = String(s).trim()
    .replace(/\s+PRIORITY\s*-?\d+\s*$/i, '')
    .replace(/\s+INPUT_JITTER\s*\d+(?:\.\d*)?\s*(ps|ns)?\s*$/i, '');
  if (parsePeriodSpec(t)) return true;
  return /^("[^"]*"|[A-Za-z_][\w$]*)\s*[/*]\s*\d+(?:\.\d*)?(?:\s+PHASE\s*[+-]?\s*\d+(?:\.\d*)?\s*(ps|ns|us|ms)?)?(?:\s+(HIGH|LOW)\s*\d+(?:\.\d*)?\s*%?)?$/i.test(t);
}

/**
 * Parse UCF text. Net names are kept as written, but for bus bits written a(0) or a[0], which
 * become a<0>: with `ports` (the top's, as normalizePort takes them), only the bits of its buses;
 * without, every name of that shape (#63).
 * @returns {{ assignments: Object<string, object>, clocks: Array, other: string[] }}
 */
export function parseUcf(text, { ports } = {}) {
  const busBit = busBitOf(ports);
  const assignments = {};
  const clocks = [];
  const other = [];          // [{ i, text }] sorted by statement position at the end
  const tnmToNet = {};
  const tnmStmts = [];       // TNM_NET/TNM attributes: kept verbatim unless a parsed clock re-creates them
  const pendingTs = [];
  const netStatements = [];  // [{ net, attrs }]: the NET statements' attributes in order (portAssignments)

  statements(text).forEach((st, i) => {
    const keep = t => other.push({ i, text: t });
    const mNet = /^NET\s+("[^"]*"|\S+)\s+(.*)$/i.exec(st);
    if (mNet) {
      const net = busBit(unq(mNet[1]));
      const rest = mNet[2];
      // Inline PERIOD on a net: NET "clk" PERIOD = 20 ns HIGH 50%;
      const mPer = /^PERIOD\s*=\s*(.*)$/i.exec(rest);
      if (mPer) {
        const p = parsePeriodSpec(mPer[1]);
        if (p) clocks.push({ net, ...p }); else keep(st);
        return;
      }
      const a = assignments[net] || {};
      const own = {};   // this statement's attributes (netStatements)
      let touched = false;
      for (const raw of rest.split('|')) {
        const part = raw.trim();
        if (!part) continue;
        const asIs = () => keep(`NET "${net}" ${part}`);
        const kv = /^([A-Za-z_]+)\s*(?:=\s*(.*))?$/.exec(part);
        if (!kv) { asIs(); continue; }
        const key = kv[1].toUpperCase();
        const val = kv[2] !== undefined && unq(kv[2]) !== '' ? unq(kv[2]) : undefined;
        const needsVal = ['LOC', 'IOSTANDARD', 'DRIVE', 'SLEW', 'CLOCK_DEDICATED_ROUTE', 'TNM_NET', 'TNM'].includes(key);
        if (needsVal && val === undefined) { asIs(); continue; }   // 'NET "a" LOC;': keep it, do not throw
        switch (key) {
          case 'LOC': own.loc = val.toUpperCase(); touched = true; break;
          case 'IOSTANDARD': own.iostandard = val.toUpperCase(); touched = true; break;
          case 'PULLUP': own.pull = 'up'; touched = true; break;
          case 'PULLDOWN': own.pull = 'down'; touched = true; break;
          case 'KEEPER': own.pull = 'keeper'; touched = true; break;
          case 'DRIVE': if (Number.isNaN(parseInt(val, 10))) asIs(); else { own.drive = parseInt(val, 10); touched = true; } break;
          case 'SLEW': own.slew = val.toLowerCase(); touched = true; break;
          case 'CLOCK_DEDICATED_ROUTE': own.clockDedicatedRoute = !/^false$/i.test(val); touched = true; break;
          case 'TNM_NET': case 'TNM': tnmToNet[val] ??= net; tnmStmts.push({ i, net, tnm: val, text: `NET "${net}" ${part}` }); break;
          default: asIs();
        }
      }
      if (touched) { assignments[net] = Object.assign(a, own); netStatements.push({ net, attrs: own }); }
      return;
    }
    const mTs = /^TIMESPEC\s+("[^"]*"|\S+)\s*=\s*PERIOD\s+("[^"]*"|\S+)\s+(.*)$/i.exec(st);
    if (mTs) { pendingTs.push({ i, st, name: unq(mTs[1]), tnm: unq(mTs[2]), spec: mTs[3] }); return; }
    keep(st);
  });

  const usedTnm = new Set();
  for (const t of pendingTs) {
    const p = parsePeriodSpec(t.spec);
    // derived ('TS_clk / 2'), with jitter, or on a group no NET defines: keep the statement as written
    if (!p || !(t.tnm in tnmToNet)) { other.push({ i: t.i, text: t.st }); continue; }
    usedTnm.add(t.tnm);
    clocks.push({ net: tnmToNet[t.tnm], name: t.name, tnm: t.tnm, ...p });
  }
  // a TNM_NET that no parsed clock re-creates (used by a derived TIMESPEC, OFFSET, TIMEGRP...) is kept
  const recreated = new Set();
  for (const t of tnmStmts) {
    if (usedTnm.has(t.tnm) && t.net === tnmToNet[t.tnm] && !recreated.has(t.tnm)) { recreated.add(t.tnm); continue; }
    other.push({ i: t.i, text: t.text });
  }
  other.sort((x, y) => x.i - y.i);
  return { assignments, clocks, other: other.map(o => o.text), netStatements };
}

/** Whether the UCF text gives a LOC to any net, the design's pins set (no text: none; an IOSTANDARD alone places
 *  nothing). Emulate and Program FPGA ask first when not (web/js/pins-check.js, #1508). */
export function ucfPlacesPins(text) {
  if (!text) return false;
  return Object.values(parseUcf(text).assignments).some(a => a.loc);
}

/** A UCF name with wildcards (* any characters, ? one character) as a RegExp of the whole name. */
export function ucfPattern(name, flags = '') {
  return new RegExp(`^${String(name).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, flags);
}
const hasWildcard = name => /[*?]/.test(name);

/**
 * The constraints of the top's port bits (names: their UCF names, x<i> for a bus bit) from a UCF's
 * NET statements (parseUcf's result): a NET name with wildcards (* and ?) is applied to every name it
 * matches, and each attribute is the last statement's that sets it, as ngdbuild does (#773). An
 * exact name is taken as written, as parseUcf keeps it (a name no port has stays in the result).
 * parsed: parseUcf's result, or { assignments } alone (taken in the order of its names).
 * @returns {{ assignments: Object<string, object>, unmatched: string[] }} unmatched: the wildcard
 *   names that match no port bit
 */
export function portAssignments(parsed, names) {
  const stmts = parsed?.netStatements || Object.entries(parsed?.assignments || {}).map(([net, attrs]) => ({ net, attrs }));
  const assignments = {}, unmatched = [];
  for (const { net, attrs } of stmts) {
    const targets = hasWildcard(net) ? names.filter(n => ucfPattern(net, 'i').test(n)) : [net];
    if (!targets.length && !unmatched.includes(net)) unmatched.push(net);
    for (const n of targets) assignments[n] = { ...assignments[n], ...attrs };
  }
  return { assignments, unmatched };
}

// ---------------------------------------------------------------------------------------------
// Board-driven assignment: match top-level ports to board resources by name
// (clk/clock -> the board clock, led/leds -> LEDs, sw/switches, btn/buttons, seg, an, ...).
// ports: [{ name, dir, width, msb, lsb }]; board: an entry of BOARDS (server/devices.js).
// Returns { assignments, clocks, matched: [portName], unmatched: [portName] }.
const ALIASES = {
  clock: 'clk', clk_50mhz: 'clk', mclk: 'clk', sysclk: 'clk', clk_in: 'clk',
  leds: 'led', ld: 'led', switches: 'sw', switch: 'sw', sws: 'sw',
  buttons: 'btn', btns: 'btn', button: 'btn', segments: 'seg', sseg: 'seg', anodes: 'an', anode: 'an',
};
// byDirection: the ports no name matches (a, b, y of a student's schematic) take the board's free
// switches then buttons (inputs) and LEDs (outputs), bit by bit, in the order of the ports;
// returned in byDirection: [{ port, nets: [[net, resource label]] }]
export function boardAutoAssign(ports, board, { byDirection = false } = {}) {
  const assignments = {}, clocks = [], matched = [], unmatched = [], directed = [];
  const res = board?.resources || [];
  const byName = new Map(res.map(r => [r.name.toLowerCase(), r]));
  for (const p of ports) {
    const key = p.name.toLowerCase();
    const alias = ALIASES[key] || key;
    let r = byName.get(key) || byName.get(alias);
    // fall back to the board's resource group (e.g. Numato boards call their switches "dip")
    const GROUP = { clk: 'Clock', led: 'LEDs', sw: 'Switches', btn: 'Buttons' };
    if (!r && GROUP[alias]) r = res.find(x => x.group === GROUP[alias] && x.pins.length >= Math.min(p.width || 1, 2)) || res.find(x => x.group === GROUP[alias]);
    if (!r) { unmatched.push(p.name); continue; }
    const attrs = pin => {
      const a = { loc: pin };   // I/O standard: the default (none written) unless the user picks one
      if (r.pull) a.pull = r.pull;
      if (r.drive) a.drive = r.drive;
      if (r.slew) a.slew = r.slew;
      if (r.clockDedicatedRoute === false) a.clockDedicatedRoute = false;
      return a;
    };
    const width = p.width || 1;
    if (width === 1 && (p.msb === null || p.msb === undefined)) {
      assignments[bitName(p.name)] = attrs(r.pins[0]);
      if (r.group === 'Clock') clocks.push({ net: bitName(p.name), period: periodNs(r.extra?.period || '20 ns'), duty: 50 });
    } else {
      const lo = Math.min(p.msb, p.lsb);
      if (width > r.pins.length) unmatched.push(`${p.name}[${lo + r.pins.length}..]`);
      for (let i = 0; i < Math.min(width, r.pins.length); i++) assignments[bitName(p.name, lo + i)] = attrs(r.pins[i]);
    }
    matched.push(p.name);
  }
  if (!byDirection) return { assignments, clocks, matched, unmatched, byDirection: directed };
  // the ports left: by direction, on the pins no port took by name
  const used = new Set(Object.values(assignments).map(a => String(a.loc).toUpperCase()));
  const free = groups => res.filter(r => groups.includes(r.group)).sort((x, y) => groups.indexOf(x.group) - groups.indexOf(y.group))
    .flatMap(r => r.pins.map((pin, i) => ({ r, pin, label: r.pins.length > 1 ? `${r.name}<${i}>` : r.name })));
  const pools = { in: free(['Switches', 'Buttons']), out: free(['LEDs']) };
  const left = [];
  for (const name of unmatched) {
    const p = ports.find(q => q.name === name);
    const pool = p && pools[p.dir];
    if (!pool) { left.push(name); continue; }
    const width = p.width || 1, bus = !(width === 1 && (p.msb === null || p.msb === undefined));
    const lo = bus ? Math.min(p.msb, p.lsb) : 0;
    const nets = [];
    for (let i = 0; i < width; i++) {
      let s;
      while ((s = pool.shift()) && used.has(String(s.pin).toUpperCase()));
      if (!s) break;
      used.add(String(s.pin).toUpperCase());
      const net = bus ? bitName(p.name, lo + i) : bitName(p.name);
      const a = { loc: s.pin };
      if (s.r.pull) a.pull = s.r.pull;
      if (s.r.drive) a.drive = s.r.drive;
      if (s.r.slew) a.slew = s.r.slew;
      assignments[net] = a;
      nets.push([net, s.label]);
    }
    if (!nets.length) { left.push(name); continue; }
    if (nets.length < width) left.push(`${p.name}[${lo + nets.length}..]`);
    directed.push({ port: p.name, nets });
    matched.push(p.name);
  }
  return { assignments, clocks, matched, unmatched: left, byDirection: directed };
}

// LOCs of a parsed UCF that are not pins of the given board (or of any of its resources).
export function locsNotOnBoard(assignments, board) {
  const pins = new Set((board?.resources || []).flatMap(r => r.pins.map(p => p.toUpperCase())));
  if (!pins.size) return [];
  return Object.entries(assignments).filter(([, a]) => a.loc && !pins.has(a.loc.toUpperCase())).map(([net, a]) => ({ net, loc: a.loc }));
}

// ---------------------------------------------------------------------------------------------
// Back-annotated pin locations (Back-annotate Pin Locations): the pads the placer chose, written as
// Xilinx pin2ucf writes them (build/<top>_pins.ucf), then added to the project's UCF for the ports
// that have no LOC yet (the user's constraints are kept as written).

/**
 * The pin file of a placement: pins [{ net, loc }] (core/xdl.js placedPins; net as the UCF names it,
 * buses as x<i>) as UCF text, one NET … LOC per port bit, sorted by name and bit.
 * header: the comment at the top.
 */
export function pinsUcf(pins, { header = 'Pin locations chosen by the placer (Silinx toolchain)' } = {}) {
  const list = [...pins].sort((a, b) => netCompare(a.net, b.net));
  const w = Math.max(8, ...list.map(p => p.net.length + 2));
  const lines = header.split('\n').map(h => `# ${h}`.trimEnd());
  lines.push('', ...list.map(p => `NET ${q(p.net).padEnd(w)} LOC = ${q(p.loc)} ;`));
  return lines.join('\n') + '\n';
}

/**
 * Add the pins of a pin file (pinsText, pin2ucf's or pinsUcf's) to a UCF (ucfText, '' or null when
 * there is none) for the nets that have no LOC in it (by name, case-insensitive); the UCF is kept
 * as written, the new LOCs go to a block of their own at the end. ports: the top's (parseUcf).
 * Returns { added: [{ net, loc }], lines: ['NET "x" LOC = "P1";' …], text } (text: null when
 * nothing is added).
 */
export function backAnnotateUcf(ucfText, pinsText, { ports, tool = 'pin2ucf', date = new Date().toISOString().slice(0, 10) } = {}) {
  const pins = parseUcf(pinsText, { ports }).assignments;
  const cur = ucfText ? parseUcf(ucfText, { ports }).assignments : {};
  const have = new Set(Object.keys(cur).filter(k => cur[k].loc).map(k => k.toLowerCase()));
  const added = Object.entries(pins).filter(([net, a]) => a.loc && !have.has(net.toLowerCase())).map(([net, a]) => ({ net, loc: a.loc }));
  const lines = added.map(({ net, loc }) => `NET "${net}" LOC = "${loc}";`);
  const text = added.length ? `${ucfText?.trim() ? `${ucfText.replace(/\s*$/, '\n')}\n` : ''}# Back-annotated pin locations (${tool}, ${date})\n${lines.join('\n')}\n` : null;
  return { added, lines, text };
}

// ---------------------------------------------------------------------------------------------
// Constraint check (the UCF part of ISE's NGDBuild "ConstraintSystem" checks, before any build).
//
// checkUcf(text, { top, ports, lang, iostandards, board, package })
//   ports: [{ name, dir, width, msb, lsb }] of the top module (from elaboration)
//   iostandards: the device family's I/O standards (optional)
//   board: a board of server/devices.js (optional: pins not on it are reported)
//   package: device package, e.g. 'cp132' (pin-name format check)
// Returns [{ line, col, severity: 'error'|'warning', message }] (1-based line/col).

const NET_ATTRS = new Set(['LOC', 'IOSTANDARD', 'PULLUP', 'PULLDOWN', 'KEEPER', 'DRIVE', 'SLEW', 'CLOCK_DEDICATED_ROUTE',
  'TNM_NET', 'TNM', 'PERIOD', 'IOB', 'IN_TERM', 'OUT_TERM', 'DIFF_TERM', 'NODELAY', 'IOBDELAY', 'IBUF_DELAY_VALUE',
  'IFD_DELAY_VALUE', 'OFFSET', 'TIG', 'MAXDELAY', 'MAXSKEW', 'KEEP', 'S', 'SAVE', 'FAST', 'SLOW', 'QUIETIO',
  'USELOWSKEWLINES', 'PULLTYPE', 'FEEDBACK', 'VCCAUX_IO', 'IN_DELAY', 'CLOCK_BUFFER', 'BUFG', 'LOCK_PINS', 'NOREDUCE']);
const IO_ATTRS = new Set(['LOC', 'IOSTANDARD', 'PULLUP', 'PULLDOWN', 'KEEPER', 'DRIVE', 'SLEW', 'IOB', 'IN_TERM', 'OUT_TERM', 'DIFF_TERM', 'FAST', 'SLOW']);
const STATEMENTS = /^(NET|INST|PIN|TIMESPEC|TIMEGRP|CONFIG|AREA_GROUP|DEFAULT|SYSTEM_JITTER|MODE)\b/i;
const DRIVES = new Set([2, 4, 6, 8, 12, 16, 24]);

/** Statements with their position in the original text: [{ text, start }] (comments blanked). */
function statementsAt(text) {
  const src = String(text);
  let clean = '';
  let inStr = false, inCom = false;
  for (const ch of src) {
    if (ch === '\n') { inCom = false; inStr = false; clean += ch; continue; }
    if (inCom) { clean += ' '.repeat(ch.length); continue; }   // astral chars are 2 UTF-16 units
    if (ch === '"') inStr = !inStr;
    if (ch === '#' && !inStr) { inCom = true; clean += ' '; continue; }
    clean += ch;
  }
  const out = [];
  let start = -1, cur = '';
  inStr = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') inStr = !inStr;
    if (ch === ';' && !inStr) { if (cur.trim()) out.push({ text: cur, start, end: i, terminated: true }); cur = ''; start = -1; continue; }
    if (start < 0 && !/\s/.test(ch)) start = i;
    if (start >= 0) cur += ch;
  }
  if (cur.trim()) out.push({ text: cur, start, end: clean.length, terminated: false, unbalanced: inStr });
  return { list: out, clean };
}

export function checkUcf(text, { top = '', ports = [], lang = 'vhdl', iostandards = null, board = null, package: pkg = '' } = {}) {
  const diags = [];
  const src = String(text);
  const { list } = statementsAt(src);
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
  const posOf = off => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lineStarts[m] <= off) lo = m; else hi = m - 1; } return { line: lo + 1, col: off - lineStarts[lo] + 1 }; };
  // position of `needle` inside statement st (falls back to the statement start)
  const at = (st, needle, from = 0) => {
    if (needle) {
      const i = src.slice(st.start, st.end).toLowerCase().indexOf(String(needle).toLowerCase(), from);
      if (i >= 0) return posOf(st.start + i);
    }
    return posOf(st.start);
  };
  const add = (severity, p, message) => diags.push({ ...p, severity, message });

  // the ports by name as written, and by name in lower case (several when they differ only in case:
  // Verilog a / A). ngdbuild takes the name as written first, else the one port that matches
  // ignoring case (measured with ISE 14.7, #85)
  const portMap = new Map(), portsLc = new Map();
  for (const p of ports) {
    const n = normalizePort(p);
    portMap.set(n.name, n);
    portsLc.set(n.name.toLowerCase(), [...(portsLc.get(n.name.toLowerCase()) || []), n]);
  }
  // ports whose netlist (UCF) name is not their HDL name (escaped identifiers: \opcode[0] ->
  // _opcode[0]_, b$c -> b_c): by UCF name and by HDL name
  const renamed = new Map(), renamedRaw = new Map();
  for (const p of portMap.values()) {
    const u = ucfPortName(p.name);
    if (u !== p.name) {
      renamed.set(u.toLowerCase(), p);
      // a VHDL extended identifier (\Mixed\) also by its text (Mixed)
      renamedRaw.set(p.name.replace(/^\\(.*)\\$/s, '$1').toLowerCase(), p);
    }
  }
  const boardPins = board ? new Map() : null;
  if (board) for (const r of board.resources || []) r.pins.forEach((pin, i) => boardPins.set(String(pin).toUpperCase(), r.pins.length > 1 ? `${r.name}<${i}>` : r.name));
  const bga = /^(cp|cs|csg|ft|ftg|fg|fgg|bg|bf|ff|cpg|clg|tqg)?/i.exec(pkg || '')[1];
  const qfpPins = /^(vq|tq|pq|vqg|tqg|pqg)(\d+)$/i.exec(pkg || '');
  const locs = new Map();       // pin -> { net, pos }
  const netLoc = new Map();     // net -> { loc, pos }
  const tnms = new Set(), tsRefs = [];
  const constrained = new Set();
  let anyLoc = false;

  for (const st of list) {
    const s = st.text.replace(/\s+/g, ' ').trim();
    if (st.unbalanced) { add('error', at(st, '"'), 'unterminated string (missing closing ")'); continue; }
    if (!st.terminated) { add('error', posOf(st.start + st.text.trimEnd().length - 1), `missing ';' at the end of the constraint "${s.slice(0, 40)}${s.length > 40 ? '…' : ''}"`); }
    if (!STATEMENTS.test(s)) { add('error', at(st), `syntax error: '${s.split(' ')[0]}' is not a UCF statement (NET, INST, TIMESPEC, TIMEGRP, CONFIG…)`); continue; }

    const mTs = /^TIMESPEC\s+("[^"]*"|\S+)\s*=\s*PERIOD\s+("[^"]*"|\S+)\s+(.*)$/i.exec(s);
    if (mTs) { tsRefs.push({ tnm: unq(mTs[2]), pos: at(st, unq(mTs[2])) }); if (!periodSpecOk(mTs[3])) add('error', at(st, 'PERIOD'), `invalid PERIOD value '${mTs[3]}'`); continue; }
    const mGrp = /^TIMEGRP\s+("[^"]*"|\S+)\s*=/i.exec(s);
    if (mGrp) { tnms.add(unq(mGrp[1])); continue; }

    const mNet = /^NET\s+("[^"]*"|\S+)\s*(.*)$/i.exec(s);
    if (!mNet) continue;
    const net = unq(mNet[1]);
    const netPos = at(st, net);
    if (!mNet[2].trim()) { add('error', netPos, `NET "${net}" has no constraint`); continue; }
    const attrs = [];
    const rest = mNet[2];
    if (/^PERIOD\s*=/i.test(rest)) {
      attrs.push('PERIOD');
      if (!periodSpecOk(rest.replace(/^PERIOD\s*=\s*/i, ''))) add('error', at(st, 'PERIOD'), `invalid PERIOD value '${rest.replace(/^PERIOD\s*=\s*/i, '')}'`);
    } else {
      for (const raw of rest.split('|')) {
        const part = raw.trim();
        if (!part) continue;
        const kv = /^([A-Za-z_]+)\s*(?:=\s*(.*))?$/.exec(part);
        if (!kv) { add('error', at(st, part), `syntax error in "${part}" (expected ATTRIBUTE = value)`); continue; }
        const key = kv[1].toUpperCase();
        const val = kv[2] !== undefined ? unq(kv[2]) : undefined;
        attrs.push(key);
        const p = at(st, kv[1]);
        if (!NET_ATTRS.has(key)) { add('warning', p, `unknown NET attribute '${kv[1]}'`); continue; }
        if ((key === 'LOC' || key === 'IOSTANDARD' || key === 'DRIVE' || key === 'SLEW' || key === 'TNM_NET' || key === 'TNM') && !val) { add('error', p, `${key} needs a value (${key} = …)`); continue; }
        if (key === 'LOC') {
          anyLoc = true;
          const pin = val.toUpperCase();
          const pp = at(st, val);
          if (bga && !qfpPins && !/^[A-Z]{1,2}\d{1,2}$/.test(pin)) add('error', pp, `'${val}' is not a pin name of the ${pkg} package (BGA pins look like A1, B12, AA3)`);
          else if (qfpPins && (!/^P\d{1,3}$/.test(pin) || +pin.slice(1) < 1 || +pin.slice(1) > +qfpPins[2])) add('error', pp, `'${val}' is not a pin of the ${pkg} package (P1…P${qfpPins[2]})`);
          else if (boardPins && !boardPins.has(pin)) add('warning', pp, `pin ${pin} is not connected to any resource of the ${board.name}`);
          const prev = locs.get(pin);
          if (prev && prev.net !== net) {
            add('error', pp, `pin ${pin} is already assigned to NET "${prev.net}" (line ${prev.pos.line})`);
          } else locs.set(pin, { net, pos: pp });
          const pl = netLoc.get(net);
          if (pl && pl.loc !== pin) add('warning', pp, `NET "${net}" already has LOC = ${pl.loc} (line ${pl.pos.line}); this one overrides it`);
          netLoc.set(net, { loc: pin, pos: pp });
        } else if (key === 'IOSTANDARD' && iostandards?.length && !iostandards.includes(val.toUpperCase())) {
          add('error', at(st, val), `IOSTANDARD '${val}' is not supported by this device family`);
        } else if (key === 'DRIVE' && !DRIVES.has(+val)) {
          add('error', at(st, val), `invalid DRIVE '${val}' (2, 4, 6, 8, 12, 16 or 24 mA)`);
        } else if (key === 'SLEW' && !/^(FAST|SLOW|QUIETIO)$/i.test(val)) {
          add('error', at(st, val), `invalid SLEW '${val}' (FAST, SLOW or QUIETIO)`);
        } else if (key === 'TNM_NET' || key === 'TNM') tnms.add(val);
      }
    }

    // does the net exist in the top module?
    if (!ports.length) continue;
    const ioAttr = attrs.some(a => IO_ATTRS.has(a));
    // a port with an escaped name, by its netlist name (_opcode[0]_, _v_x_<1>)
    const mEsc = /^(.*?)\s*<\s*(-?\d+)\s*>$/.exec(net);
    let m = renamed.has(net.toLowerCase()) ? [net, net] : mEsc && renamed.has(mEsc[1].toLowerCase()) ? [net, mEsc[1], '<', mEsc[2]] : null;
    if (!m) {
      // ... or by its HDL name, which ngdbuild does not find (ConstraintSystem:59)
      // also as written in Verilog (\opcode[0]) or VHDL (\Mixed\, \Bus\(1))
      const rawNet = net.trim().replace(/^\\([^\\]*)\\/, '$1').replace(/^\\/, '').trim().toLowerCase();
      const mRaw = /^(.*?)\s*[<([]\s*(-?\d+)\s*[>)\]]$/.exec(rawNet);
      const raw = renamedRaw.has(rawNet) ? [renamedRaw.get(rawNet)] : mRaw && renamedRaw.has(mRaw[1]) ? [renamedRaw.get(mRaw[1]), mRaw[2]] : null;
      if (raw) {
        const [p, b] = raw;
        const want = bitName(p.name, p.bus ? (b ?? p.lsb) : null);
        add('error', netPos, `NET "${net}" is not found by ISE: XST names the port '${p.name}' ${bitName(p.name)} in its netlist (use NET "${want}")`);
        continue;
      }
      if (net.includes('/')) continue;   // hierarchical names: resolved by the tools
      // a name with wildcards (* and ?, ignoring case as ngdbuild): every port bit it matches (#773); one that
      // matches no design object stops ngdbuild (ConstraintSystem:58, measured with ISE 14.7)
      if (hasWildcard(net)) {
        const re = ucfPattern(net, 'i');
        if ([...portMap.values()].some(p => expandPort(p).some(n => re.test(n)))) continue;
        const msg = `NET "${net}" matches no port of the top module '${top}'`;
        if (ioAttr) add('error', netPos, `${msg} (ISE: "does not match any design objects")`);
        else add('warning', netPos, `${msg} (timing constraints on internal nets are resolved after synthesis)`);
        continue;
      }
      m = /^([A-Za-z_][\w$]*)\s*(?:([<([])\s*(-?\d+)\s*[>)\]])?$/.exec(net);
    }
    if (!m) { add('error', netPos, `invalid net name '${net}'`); continue; }
    const ci = portsLc.get(m[1].toLowerCase()) || [];
    if (!portMap.has(m[1]) && ci.length > 1) {
      add('error', netPos, `NET "${net}" matches no port as written and several ignoring case (${ci.map(p => p.name).join(', ')}): write the one you mean`);
      continue;
    }
    const port = portMap.get(m[1]) || ci[0] || renamed.get(m[1].toLowerCase());
    if (!port) {
      const msg = `NET "${net}" does not exist in the top module '${top}'`;
      if (ioAttr) add('error', netPos, `${msg} (no port named '${m[1]}')`);
      else add('warning', netPos, `${msg} as a port (timing constraints on internal nets are resolved after synthesis)`);
      continue;
    }
    const uName = bitName(port.name);   // the port's name in the UCF (XST's)
    // (ngdbuild takes it, ignoring the case, as the only port of that name)
    if (lang === 'verilog' && uName !== m[1] && uName.toLowerCase() === m[1].toLowerCase()) add('warning', netPos, `NET "${net}": the port is called '${uName}' (ISE matches it ignoring the case; Verilog names are case-sensitive)`);
    if (m[2] && m[2] !== '<') add('warning', at(st, m[2]), `use ${m[1]}<${m[3]}> for a bus bit in UCF (the default bus delimiter is <>)`);
    if (port.bus && m[3] === undefined) {
      if (ioAttr) add('error', netPos, `'${m[1]}' is a ${port.width}-bit bus: constrain each bit (NET "${m[1]}<${port.lsb}>" …)`);
      continue;
    }
    if (!port.bus && m[3] !== undefined) { add('error', netPos, `'${port.name}' is a single bit, not a bus: use NET "${uName}"`); continue; }
    if (port.bus) {
      const b = +m[3], lo = Math.min(port.msb, port.lsb), hi = Math.max(port.msb, port.lsb);
      if (b < lo || b > hi) { add('error', at(st, m[3]), `bit ${b} is out of range for '${port.name}' (${port.msb} downto ${port.lsb})`); continue; }
      if (attrs.includes('LOC')) constrained.add(bitName(port.name, b));
    } else if (attrs.includes('LOC')) constrained.add(uName);
  }

  for (const t of tsRefs) if (!tnms.has(t.tnm)) add('error', t.pos, `TIMESPEC refers to the timing group "${t.tnm}", which no TNM_NET/TNM/TIMEGRP defines`);

  // ports without a pin (only when the file places pins at all)
  if (anyLoc && ports.length) {
    const missing = [];
    for (const p of portMap.values()) for (const n of expandPort(p)) if (!constrained.has(n)) missing.push(n);
    if (missing.length) add('warning', { line: Math.max(1, lineStarts.length - (src.endsWith('\n') ? 1 : 0)), col: 1 },
      `${missing.length} port bit(s) of '${top}' have no LOC: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}`);
  }
  return diags.sort((a, b) => a.line - b.line || a.col - b.col);
}
