// ISE's timing paths (#3178): the paths of trce's verbose report (<top>.twr), stage by stage, as the Silinx toolchain's
// timing analysis gives them (packages/silinx-fpga/src/fpga/timing-paths.js), for the timing report's Paths panel and the
// MCP's timing_paths: each path's clock, requirement, delay and slack, and its stages (clock-to-out, net, logic, setup)
// with their sites, pins, nets and the names of the logic they go through (XST's: u_pre/cnt_1, u_pre/cnt<1>), as
// signals (u_pre.cnt_1, u_pre.cnt) by which the source lines and the drawings are found.
//
//   iseTimingPaths(text, sources, top)   // { top, paths, toolchain: 'ise' }: the paths with their source lines
//   twrSources(parseTwrPaths(text), signalDrivers(lib, top))   // the same, by parts (core/hdl-drivers.js)
//   parseTwrPaths(text)   // { paths: [{ clock, port: null, required, delay, period, half, slack, from, to, end, stages,
//                         //   lines: [] }] }, the slowest first
import { compile } from './compile.js';
import { signalDrivers } from './hdl-drivers.js';

const NUM = '(-?\\d+(?:\\.\\d+)?)';
// trce's delay types: the clock-to-out ones (Tcko, Tcko of a block RAM or multiplier: Trcko_DOA, Tmult…cko), the setup
// ones (Tdick, Tsrck, Tceck, Tdxck, Tfck, Trcck_ADDRA …: a type that ends with its clock's ck)
const clockToOut = t => /^T\w*cko(_\w+)?$/i.test(t);
const setup = t => /^T\w*ck(_\w+)?$/i.test(t) && !clockToOut(t);

/** XST's name as a signal: its hierarchy with dots, its bit (<3>) dropped. */
export const twrSignal = n => n.replace(/<\d+>$/, '').replace(/\//g, '.');
/** The signal XST made a name from (null when it is the signal's own): its operator's prefix (Mcompar_, Madd_ …) and
 *  suffix (_cmp_eq0000, _or0000, _not0001, _addsub0001 and their _cy / _lut parts), a state machine's flip-flops
 *  (_FSM_FFd3), a LUT's split (_SW0) dropped: u_timer/last_cmp_eq0000_wg_lut<3> -> u_timer.last. */
export function xstBase(n) {
  const s = twrSignal(n.replace(/<\d+>/g, '')), dot = s.lastIndexOf('.'), head = s.slice(0, dot + 1), last = s.slice(dot + 1);
  const b = last.replace(/^M(?:add|sub|addsub|compar|count|mux|xor|mult|sh|shift)_/i, '')
    .replace(/_(?:cmp_[a-z]+|or|and|not|mux|addsub|add|sub|xor|share|eq|ne|lt|gt|le|ge|inv)\d{4}.*$/i, '')
    .replace(/_FSM_FFd\d+.*$/, '').replace(/_SW\d+$/, '').replace(/_INV_\d+$/, '');
  return b && b !== last && /^[A-Za-z_]\w*$/.test(b) ? head + b : null;
}

// one stage line: "SLICE_X29Y34.YQ      Tcko                  0.587   u_pre/cnt<0>"
// (an estimated delay: trce's `e` before it)
const STAGE = new RegExp(`^ {4}(\\S+)\\.(\\S+) +(net \\(fanout=\\d+\\)|\\S+) +(?:e +)?${NUM} +(\\S+)\\s*$`);
const MORE = /^ {50,}(\S+)\s*$/;

/** The paths of a verbose trce report (each "Slack:" block with its "Maximum Data Path"), slowest first. */
export function parseTwrPaths(text) {
  const lines = String(text || '').split(/\r?\n/);
  const paths = [];
  let constraint = null, end = null;
  for (let i = 0; i < lines.length; i++) {
    const c = /^Timing constraint: (\S+) = PERIOD (?:TIMEGRP )?"?([^"\s]+)"? ([\d.]+) ?ns/.exec(lines[i]);
    if (c) { constraint = { name: c[1], group: c[2], period: +c[3] }; continue; }
    // (the end point of the paths that follow: its flip-flop's pin, its data, set / reset or clock enable)
    const e = /^Paths for end point \S+ \((\S+)\)/.exec(lines[i]);
    if (e) { end = e[1]; continue; }
    const s = new RegExp(`^Slack(?: \\(setup path\\))?: +${NUM}ns`).exec(lines[i]);
    if (!s) continue;
    const p = { slack: +s[1] }, head = {};
    let j = i + 1;
    for (; j < lines.length && !/^ {2}Maximum Data Path/.test(lines[j]) && !/^Slack/.test(lines[j]); j++) {
      const f = /^ {2}([A-Z][\w ]+?): +(.*)$/.exec(lines[j]);
      if (f) head[f[1]] = f[2].trim();
    }
    if (!/^ {2}Maximum Data Path/.test(lines[j] || '')) continue;
    // its stages: each line, then the logical resources under it
    const stages = [];
    for (j++; j < lines.length && !/^ {4}Total /.test(lines[j]) && !/^Slack/.test(lines[j]); j++) {
      const m = STAGE.exec(lines[j]);
      if (m) {
        const type = m[3], net = type.startsWith('net');
        stages.push({ kind: net ? 'net' : clockToOut(m[3]) ? 'clock-to-out' : setup(m[3]) ? 'setup' : 'logic', type: net ? 'net' : type,
          inst: m[1], pin: m[2], site: m[1], delay: +m[4], ...(net ? { net: m[5] } : {}), resources: net ? [] : [m[5]] });
        continue;
      }
      const more = MORE.exec(lines[j]);
      if (more && stages.length && !/^-+$/.test(more[1]) && stages.at(-1).kind !== 'net') stages.at(-1).resources.push(more[1]);
    }
    if (!stages.length) continue;
    let arrival = 0;
    for (const st of stages) {
      arrival = +(arrival + st.delay).toFixed(3);
      st.arrival = arrival;
      // (a net's own name; a component's names, the first its output's: XST's signals, a register's bit name too)
      const names = st.kind === 'net' ? [st.net] : st.resources;
      st.signals = [...new Set(names.flatMap(n => [twrSignal(n), ...(/_\d+$/.test(n) && st.kind !== 'logic' ? [twrSignal(n.replace(/_\d+$/, ''))] : []), xstBase(n)].filter(Boolean)))];
      st.sources = [];
    }
    const num = k => { const v = new RegExp(`^${NUM}ns`).exec(head[k] || ''); return v ? +v[1] : null; };
    const delay = num('Data Path Delay') ?? arrival, required = num('Requirement');
    const half = /falling/.test(head['Source Clock'] || '') !== /falling/.test(head['Destination Clock'] || '');
    paths.push({ clock: (head['Destination Clock'] || head['Source Clock'] || '').split(' ')[0] || null, port: null, constraint: constraint?.name ?? null,
      required, delay, period: +(delay * (half ? 2 : 1)).toFixed(3), half, slack: p.slack,
      from: (head.Source || '').replace(/ \(.*\)$/, ''), to: (head.Destination || '').replace(/ \(.*\)$/, ''), end, stages, lines: [] });
    i = j;
  }
  return { paths: paths.sort((a, b) => b.period - a.period) };
}

/** Each stage's source lines (but a net's) and each path's, from its signals: where(name) -> [{ file, line, block }]
 *  (core/hdl-drivers.js signalDrivers). The paths changed in place; returned. */
export function twrSources(r, where) {
  for (const p of r.paths) {
    const seen = new Set();
    p.lines = [];
    for (const st of p.stages) {
      if (st.kind === 'net') continue;
      const own = new Set();
      st.sources = st.signals.flatMap(where).filter(x => { const k = `${x.file}:${x.line}`; return !own.has(k) && own.add(k); });
      for (const x of st.sources) { const k = `${x.file}:${x.line}`; if (!seen.has(k)) { seen.add(k); p.lines.push({ file: x.file, line: x.line }); } }
    }
  }
  return r;
}

/** ISE's timing paths of a project: its trce report's, each stage back to the project's HDL (sources: [{ path, lang,
 *  text }], the design's; a source that does not compile leaves the paths with no lines). */
export function iseTimingPaths(text, sources, top) {
  let where = () => [];
  try { where = signalDrivers(compile(sources.filter(s => s.lang === 'vhdl' || s.lang === 'verilog')), top); } catch { /* not compiled: no lines */ }
  return { top, toolchain: 'ise', ...twrSources(parseTwrPaths(text), where) };
}
