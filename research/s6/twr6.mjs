// Stage S6-G (#731): ISE's timing report (trce -v, a .twr) of a Spartan-6 design read: every detailed path of each
// constraint (its maximum data path at the slow corner): the slack, requirement, data path delay, clock path skew
// and uncertainty, and the path's elements in order (a logic arc: its site.pin, type (Tilo, Tcko, Tas …) and delay;
// a net: the load's site.pin, its fanout, delay and name; a net's driver is the element before it).
//   node research/s6/twr6.mjs <file.twr> …   -> per constraint: its paths, the worst slack; the logic arcs' delays
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const num = s => (s === undefined ? null : parseFloat(s));

/** A .twr's paths: [{ constraint, slack, requirement, dataPath, skew, uncertainty, source, dest, srcClock, destClock, elements: [{ loc, type, delay, fanout?, name }] }]. */
export function parseTwr(text) {
  const lines = text.split('\n'), out = [];
  let constraint = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = l.match(/^Timing constraint: (.*)$/))) { constraint = m[1].trim(); continue; }
    if (/^(Component Switching Limit Checks|Hold Paths)/.test(l)) { constraint = null; continue; }
    if (!constraint || !(m = l.match(/^Slack(?: \(setup path\))?:\s+(-?[\d.]+)ns/))) continue;
    const p = { constraint, slack: num(m[1]), elements: [] };
    for (i++; i < lines.length && !/^(Slack|Timing constraint)/.test(lines[i]); i++) {
      const x = lines[i];
      if ((m = x.match(/^\s+Source:\s+(\S+)/))) p.source = m[1];
      else if ((m = x.match(/^\s+Destination:\s+(\S+)/))) p.dest = m[1];
      else if ((m = x.match(/^\s+Requirement:\s+(-?[\d.]+)ns/))) p.requirement = num(m[1]);
      else if ((m = x.match(/^\s+Data Path Delay:\s+(-?[\d.]+)ns/))) p.dataPath = num(m[1]);
      else if ((m = x.match(/^\s+Clock Path Skew:\s+(-?[\d.]+)ns/))) p.skew = num(m[1]);
      else if ((m = x.match(/^\s+Clock Uncertainty:\s+(-?[\d.]+)ns/))) p.uncertainty = num(m[1]);
      else if ((m = x.match(/^\s+Source Clock:\s+(\S+) (rising|falling)/))) p.srcClock = m[1];
      else if ((m = x.match(/^\s+Destination Clock:\s+(\S+) (rising|falling)/))) p.destClock = m[1];
      else if ((m = x.match(/^\s{4}(\S+)\s+net \(fanout=(\d+)\)\s+(-?[\d.]+)\s+(\S+)/))) p.elements.push({ loc: m[1], type: 'net', fanout: +m[2], delay: num(m[3]), name: m[4] });
      else if ((m = x.match(/^\s{4}(\S+\.\S+)\s+(T\S+)\s+(-?[\d.]+)\s+(\S+)/))) p.elements.push({ loc: m[1], type: m[2], delay: num(m[3]), name: m[4] });
      else if (/^\s+Total\s+-?[\d.]+ns/.test(x)) break;
    }
    out.push(p);
  }
  return out;
}

/**
 * A .twr's OFFSET analyses (unconstrained or not): [{ kind: 'in' | 'out', clock, offset (the minimum / maximum
 * allowable), paths: [{ offset, source, dest, dataPath, clockPath, uncertainty, data: [element], clk: [element] }] }],
 * each path's data and clock tables apart (an element as parseTwr's).
 */
export function parseOffsets(text) {
  const lines = text.split('\n'), out = [];
  let cur = null, path = null, table = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if (/^Timing constraint:/.test(l)) {
      cur = null;
      if ((m = l.match(/OFFSET (IN|OUT)\b/))) {
        const clock = (l + (lines[i + 1] ?? '')).match(/clock\s+"([^"]+)"/)?.[1] ?? null;
        out.push(cur = { kind: m[1].toLowerCase(), clock, offset: null, paths: [] });
      }
      continue;
    }
    if (!cur) continue;
    if ((m = l.match(/^\s+(?:Minimum|Maximum) allowable offset is\s+(-?[\d.]+)ns/))) cur.offset = num(m[1]);
    else if ((m = l.match(/^Offset:\s+(-?[\d.]+)ns/))) { cur.paths.push(path = { offset: num(m[1]), data: [], clk: [] }); table = null; }
    else if (!path) continue;
    else if ((m = l.match(/^\s+Source:\s+(\S+)/))) path.source = m[1];
    else if ((m = l.match(/^\s+Destination:\s+(\S+)/))) path.dest = m[1];
    else if ((m = l.match(/^\s+Data Path Delay:\s+(-?[\d.]+)ns/))) path.dataPath = num(m[1]);
    else if ((m = l.match(/^\s+Clock Path Delay:\s+(-?[\d.]+)ns/))) path.clockPath = num(m[1]);
    else if ((m = l.match(/^\s+Clock Uncertainty:\s+(-?[\d.]+)ns/))) path.uncertainty ??= num(m[1]);
    else if (/^\s+Maximum Data Path/.test(l)) table = path.data;
    else if (/^\s+(Minimum|Maximum) Clock Path/.test(l)) table = path.clk;
    else if (/^\s+Total\s+-?[\d.]+ns/.test(l)) table = null;
    else if (table && (m = l.match(/^\s{4}(\S+)\s+net \(fanout=(\d+)\)\s+(-?[\d.]+)\s+(\S+)/))) table.push({ loc: m[1], type: 'net', fanout: +m[2], delay: num(m[3]), name: m[4] });
    else if (table && (m = l.match(/^\s{4}(\S+\.\S+)\s+(T\S+)\s+(-?[\d.]+)\s+(\S+)/))) table.push({ loc: m[1], type: m[2], delay: num(m[3]), name: m[4] });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node research/s6/twr6.mjs <file.twr> …'); process.exit(1); }
  const arcs = {};
  let paths = 0, nets = 0;
  for (const f of files) {
    const ps = parseTwr(fs.readFileSync(f, 'utf8'));
    paths += ps.length;
    for (const p of ps) for (const e of p.elements) { if (e.type === 'net') nets++; else (arcs[e.type] ??= []).push(e.delay); }
  }
  console.log(`${files.length} reports, ${paths} paths, ${nets} nets; logic arcs (type: n, distinct delays):`);
  console.log(Object.entries(arcs).sort((a, b) => b[1].length - a[1].length).map(([t, d]) => `${t}: ${d.length} ${[...new Set(d)].sort((a, b) => a - b).join('/')}`).join('\n'));
}
