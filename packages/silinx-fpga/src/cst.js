// Silinx toolchain - the Gowin's constraints, CST (#2303), as nextpnr-himbaechel-gowin reads them: a format of constraints.js's
// model.
//   IO_LOC "led[0]" 10;                                        a port's pin
//   IO_PORT "led[0]" IO_TYPE=LVCMOS18 PULL_MODE=NONE DRIVE=8;  its I/O standard, pull, drive and the rest
//   // create_clock -name clk -period 37.037 [get_ports {clk}]   a clock's period: Silinx's, in a comment (a CST has none:
//                                                               Gowin's tools read it from an SDC), given to nextpnr as --freq
// '//' starts a comment, ';' ends a statement. The names are nextpnr's (led[0]). Another statement throws, naming its line:
// nextpnr would not apply it.
import { periodNs } from './ucf.js';

const PULLS = { UP: 'up', DOWN: 'down', NONE: null, KEEPER: 'keeper' };
const PULL_MODE = { up: 'UP', down: 'DOWN', keeper: 'KEEPER' };
const CLOCK = /^\/\/\s*create_clock\s+(?:-name\s+\S+\s+)?-period\s+([\d.]+)\s+\[get_ports\s+\{?([^\s}\]]+)\}?\]\s*;?\s*$/;

function readCst(text) {
  const assignments = {}, netStatements = [], clocks = [];
  const set = (net, attrs) => {
    netStatements.push({ net, attrs: { ...attrs } });
    assignments[net] = { ...assignments[net], ...attrs };
  };
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const fail = msg => { throw new Error(`line ${i + 1}: ${msg}`); };
    const clock = CLOCK.exec(raw.trim());
    if (clock) {
      if (!(+clock[1] > 0)) fail('create_clock needs a period in ns');
      clocks.push({ net: clock[2], period: +clock[1] });
      return;
    }
    for (const part of raw.replace(/\/\/.*$/, '').split(';').map(s => s.trim()).filter(Boolean)) {
      const m = /^(\w+)\s*(.*)$/.exec(part), verb = m[1].toUpperCase();
      if (verb === 'IO_LOC') {
        const l = /^"([^"]+)"\s+([^\s,]+)(?:\s*,\s*\S+)?$/.exec(m[2]);
        if (!l) fail('IO_LOC needs "<port>" and its pin');
        set(l[1], { loc: l[2] });
      } else if (verb === 'IO_PORT') {
        const l = /^"([^"]+)"\s*(.*)$/.exec(m[2]);
        if (!l) fail('IO_PORT needs "<port>" and its attributes');
        const attrs = {};
        for (const kv of l[2].split(/\s+/).filter(Boolean)) {
          const [k, v] = kv.split('=');
          if (!v) fail(`IO_PORT ${l[1]}: ${kv} is not KEY=VALUE`);
          const key = k.toUpperCase();
          if (key === 'IO_TYPE') attrs.iostandard = v;
          else if (key === 'PULL_MODE') {
            if (!(v.toUpperCase() in PULLS)) fail(`PULL_MODE=${v}: UP, DOWN, NONE or KEEPER`);
            attrs.pull = PULLS[v.toUpperCase()];
          } else if (key === 'DRIVE') attrs.drive = v;
          else attrs.cst = { ...attrs.cst, [key]: v };
        }
        set(l[1], attrs);
      } else fail(`${m[1]}: not a CST statement nextpnr-himbaechel-gowin applies (IO_LOC, IO_PORT)`);
    }
  });
  return { assignments, netStatements, clocks, other: [] };
}

const q = s => `"${s}"`;
function writeCst({ assignments = {}, clocks = [] }) {
  const lines = [];
  for (const [net, a] of Object.entries(assignments)) {
    if (a?.loc) lines.push(`IO_LOC ${q(net)} ${a.loc};`);
    const attrs = [a?.iostandard && `IO_TYPE=${a.iostandard}`, a?.pull !== undefined && `PULL_MODE=${PULL_MODE[a.pull] || 'NONE'}`, a?.drive && `DRIVE=${a.drive}`,
      ...Object.entries(a?.cst || {}).map(([k, v]) => `${k}=${v}`)].filter(Boolean);
    if (attrs.length) lines.push(`IO_PORT ${q(net)} ${attrs.join(' ')};`);
  }
  for (const c of clocks) lines.push(`// create_clock -name ${c.net.replace(/\W/g, '_')} -period ${periodNs(c.period).toFixed(3)} [get_ports {${c.net}}]`);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

export const CST = { id: 'cst', read: text => readCst(text), write: writeCst, comment: '//' };
