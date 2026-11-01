// Silinx toolchain - the iCE40's constraints, PCF (#2295), as nextpnr-ice40 reads them: a format of constraints.js's model.
//   set_io [-nowarn] [-pullup yes|no] [-pullup_resistor 3P3K|6P8K|10K|100K] <port> <pin>   a port's pin
//   set_frequency <net> <MHz>                                                              a clock's frequency
// '#' starts a comment. Another command throws, naming its line: nextpnr would stop at it.
import { periodNs } from './ucf.js';

const RESISTORS = ['3P3K', '6P8K', '10K', '100K'];

function readPcf(text) {
  const assignments = {}, netStatements = [], clocks = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const words = raw.replace(/#.*/, '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const fail = msg => { throw new Error(`line ${i + 1}: ${msg}`); };
    const [cmd, ...args] = words;
    if (cmd === 'set_io') {
      const attrs = {}, rest = [];
      for (let k = 0; k < args.length; k++) {
        const a = args[k];
        if (a === '-nowarn') attrs.nowarn = true;
        else if (a === '-pullup') {
          const v = args[++k];
          if (v !== 'yes' && v !== 'no') fail(`-pullup ${v ?? ''}: yes or no`);
          attrs.pull = v === 'yes' ? 'up' : null;
        } else if (a === '-pullup_resistor') {
          const v = args[++k];
          if (!RESISTORS.includes(v)) fail(`-pullup_resistor ${v ?? ''}: ${RESISTORS.join(', ')}`);
          attrs.pullupResistor = v;
        } else if (a.startsWith('-')) fail(`set_io: no option ${a}`);
        else rest.push(a);
      }
      if (rest.length !== 2) fail('set_io needs a port and a pin');
      const [net, loc] = rest;
      attrs.loc = loc;
      netStatements.push({ net, attrs: { ...attrs } });
      assignments[net] = { ...assignments[net], ...attrs };
    } else if (cmd === 'set_frequency') {
      const mhz = Number(args[1]);
      if (args.length !== 2 || !(mhz > 0)) fail('set_frequency needs a net and its frequency in MHz');
      clocks.push({ net: args[0], period: +periodNs(`${args[1]} MHz`).toFixed(6) });
    } else fail(`${cmd}: not a PCF command (set_io, set_frequency)`);
  });
  return { assignments, netStatements, clocks, other: [] };
}

function writePcf({ assignments = {}, clocks = [] }) {
  const lines = [];
  for (const [net, a] of Object.entries(assignments)) {
    if (!a?.loc) continue;
    lines.push(['set_io', a.nowarn && '-nowarn', a.pull === 'up' && '-pullup yes', a.pullupResistor && `-pullup_resistor ${a.pullupResistor}`, net, a.loc].filter(Boolean).join(' '));
  }
  for (const c of clocks) lines.push(`set_frequency ${c.net} ${+(1000 / periodNs(c.period)).toFixed(6)}`);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

export const PCF = { id: 'pcf', read: text => readPcf(text), write: writePcf };
