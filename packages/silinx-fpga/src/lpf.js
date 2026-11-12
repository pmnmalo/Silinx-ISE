// Silinx toolchain - the ECP5's constraints, LPF (#2302), as nextpnr-ecp5 reads them: a format of constraints.js's model.
//   LOCATE COMP "led[0]" SITE "B2";                                      a port's pin
//   IOBUF PORT "led[0]" IO_TYPE=LVCMOS33 PULLMODE=NONE DRIVE=4;          its I/O standard, pull, drive, slew and the rest
//   FREQUENCY PORT "clk" 25 MHZ;                                         a clock's frequency (FREQUENCY NET too)
//   BLOCK RESETPATHS;  SYSCONFIG CONFIG_IOVOLTAGE=3.3 …;                 the board's, kept as they are (the model's `other`)
// '#' and '//' start a comment, ';' ends a statement. The names are nextpnr's (led[0]), as PCF's. Another statement throws,
// naming its line: nextpnr-ecp5 would not apply it.
import { byName, periodNs, setByName } from './ucf.js';

const PULLS = { UP: 'up', DOWN: 'down', NONE: null, KEEPER: 'keeper', BUSHOLD: 'keeper' };
const PULL_MODE = { up: 'UP', down: 'DOWN', keeper: 'KEEPER' };
const KEPT = ['BLOCK', 'SYSCONFIG'];

// the statements of a text: [{ text, line }], comments out, ';' their end (a statement may span lines)
function statements(text) {
  const out = [];
  let cur = '', start = 0;
  String(text).split(/\r?\n/).forEach((raw, i) => {
    let rest = raw.replace(/(#|\/\/).*$/, '');
    for (;;) {
      const k = rest.indexOf(';');
      if (k < 0) break;
      if (!cur.trim()) start = i + 1;
      cur += ` ${rest.slice(0, k)}`;
      if (cur.trim()) out.push({ text: cur.trim(), line: start });
      cur = ''; rest = rest.slice(k + 1);
    }
    if (rest.trim()) { if (!cur.trim()) start = i + 1; cur += ` ${rest}`; }
  });
  if (cur.trim()) out.push({ text: cur.trim(), line: start, open: true });
  return out;
}

function readLpf(text) {
  const assignments = {}, netStatements = [], clocks = [], other = [];
  let line = 0;
  const set = (net, attrs) => {
    netStatements.push({ net, attrs: { ...attrs }, line });
    setByName(assignments, net, { ...byName(assignments, net), ...attrs });
  };
  for (const st of statements(text)) {
    const fail = msg => { throw new Error(`line ${st.line}: ${msg}`); };
    line = st.line;
    if (st.open) fail(`${st.text.split(/\s+/)[0]}: no ';' at its end`);
    const m = /^(\w+)\s*(.*)$/s.exec(st.text), verb = m[1].toUpperCase(), rest = m[2];
    if (verb === 'LOCATE') {
      const l = /^COMP\s+"([^"]+)"\s+SITE\s+"([^"]+)"$/i.exec(rest);
      if (!l) fail('LOCATE needs COMP "<port>" SITE "<pin>"');
      set(l[1], { loc: l[2] });
    } else if (verb === 'IOBUF') {
      const l = /^PORT\s+"([^"]+)"\s*(.*)$/is.exec(rest);
      if (!l) fail('IOBUF needs PORT "<port>" and its attributes');
      const attrs = {};
      for (const kv of l[2].split(/\s+/).filter(Boolean)) {
        const [k, v] = kv.split('=');
        if (!v) fail(`IOBUF ${l[1]}: ${kv} is not KEY=VALUE`);
        const key = k.toUpperCase();
        if (key === 'IO_TYPE') attrs.iostandard = v;
        else if (key === 'PULLMODE') {
          if (!(v.toUpperCase() in PULLS)) fail(`PULLMODE=${v}: UP, DOWN, NONE or KEEPER`);
          attrs.pull = PULLS[v.toUpperCase()];
        } else if (key === 'DRIVE') attrs.drive = v;
        else if (key === 'SLEWRATE') attrs.slew = v.toUpperCase();
        else attrs.lpf = { ...attrs.lpf, [key]: v };
      }
      set(l[1], attrs);
    } else if (verb === 'FREQUENCY') {
      const l = /^(?:PORT|NET)\s+"([^"]+)"\s+([\d.]+)\s*(MHZ|KHZ|HZ)$/i.exec(rest);
      if (!l || !(+l[2] > 0)) fail('FREQUENCY needs PORT "<port>" (or NET) and its frequency: 25 MHZ');
      const mhz = +l[2] * { MHZ: 1, KHZ: 1e-3, HZ: 1e-6 }[l[3].toUpperCase()];
      clocks.push({ net: l[1], period: +periodNs(`${mhz} MHz`).toFixed(6) });
    } else if (KEPT.includes(verb)) other.push(`${st.text};`);
    else fail(`${m[1]}: not an LPF statement nextpnr-ecp5 applies (LOCATE, IOBUF, FREQUENCY, BLOCK, SYSCONFIG)`);
  }
  return { assignments, netStatements, clocks, other };
}

const q = s => `"${s}"`;
function writeLpf({ assignments = {}, clocks = [], other = [] }) {
  const lines = [...other];
  for (const [net, a] of Object.entries(assignments)) {
    if (a?.loc) lines.push(`LOCATE COMP ${q(net)} SITE ${q(a.loc)};`);
    const attrs = [a?.iostandard && `IO_TYPE=${a.iostandard}`, a?.pull !== undefined && `PULLMODE=${PULL_MODE[a.pull] || 'NONE'}`, a?.drive && `DRIVE=${a.drive}`,
      a?.slew && `SLEWRATE=${String(a.slew).toUpperCase()}`, ...Object.entries(a?.lpf || {}).map(([k, v]) => `${k}=${v}`)].filter(Boolean);
    if (attrs.length) lines.push(`IOBUF PORT ${q(net)} ${attrs.join(' ')};`);
  }
  for (const c of clocks) lines.push(`FREQUENCY PORT ${q(c.net)} ${+(1000 / periodNs(c.period)).toFixed(6)} MHZ;`);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

export const LPF = { id: 'lpf', read: text => readLpf(text), write: writeLpf };
