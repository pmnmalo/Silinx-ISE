// AMD Vivado's timing paths (#3178): the setup paths of its report_timing_summary (build/<top>_timing.rpt, server/vivado.js:
// -max_paths 10, the worst ten of each clock), stage by stage as the Silinx toolchain's and ISE's (core/twr-paths.js),
// for the timing report's Paths panel and the MCP's timing_paths: each path's clock, requirement, delay and slack, its
// stages (clock-to-out, net, logic, setup) with their sites, cells and nets, and the signals Vivado named them after
// (u_speed/step_reg_reg -> u_speed.step_reg, u_count/tens[3]_i_2 -> u_count.tens), by which the source lines and the
// drawings are found (core/hdl-drivers.js).
//
//   vivadoTimingPaths(text, sources, top)   // { top, toolchain: 'vivado', paths }: with their source lines
//   parseVivadoPaths(text)                  // { paths: [{ clock, port: null, required, delay, period, half, slack, from,
//                                           //   to, end, stages, lines: [] }] }, the slowest first
import { compile } from './compile.js';
import { signalDrivers, upward } from './hdl-drivers.js';
import { twrSources } from './twr-paths.js';

const NUM = '(-?\\d+(?:\\.\\d+)?)';
// a cell's pin at the end of a name: /Q, /O, a DSP's /A[2]
const PIN = /\/[A-Z][A-Z0-9]*(?:\[\d+\])?$/;
/** A name of Vivado's netlist as the signal it comes from: its pin (/Q) and bits ([3]) dropped, a flip-flop's _reg,
 *  a LUT's _i_2 and a net's _n_0, its hierarchy with dots. */
export function vivadoSignal(n) {
  const path = String(n).replace(PIN, '').split('/'), head = path.slice(0, -1);
  const last = path.at(-1).replace(/\[\d+\]/g, '').replace(/__\d+$/, '').replace(/_n_\d+$/, '').replace(/(_i)?_\d+_?$/, '').replace(/_reg_\d+_\d+_\d+_\d+$/, '')
    .replace(/^FSM_(?:sequential|onehot|gray)_/, '').replace(/_(?:OBUF|IBUF)(?:_inst)?$/, '').replace(/\d*_carry(?:__\d+)?$/, '').replace(/_reg$/, '');
  return [...head, last].join('.');
}
// (an operator's result: quotient0, its signal's name and its operator's number)
const variants = n => [n, ...(/\D\d$/.test(n) ? [n.replace(/\d$/, '')] : [])];

// a stage of the data path: "SLICE_X3Y17  FDRE (Prop_fdre_C_Q)  0.456  5.606 r  u_speed/step_reg_reg/Q", a net:
// "net (fo=4, routed)  1.124  6.731  u_count/speed_step", the end: "SLICE_X8Y13  FDRE  r  u_count/thousands_reg[0]/R"
const CELL = new RegExp(`^ {4}(\\S+) +(\\S+) \\((\\w+)\\) +${NUM} +${NUM} [rf] +(\\S+)\\s*$`);
const NET = new RegExp(`^ {25}net \\(fo=\\d+(?:, \\w+)?\\) +${NUM} +${NUM} +(\\S+)\\s*$`);
const END = /^ {4}(\S+) +(\S+) +[rf] +(\S+)\s*$/;
const SETUP = new RegExp(`^ {4}(\\S+) +(\\S+) \\((Setup_\\w+)\\) +${NUM} +${NUM} +(\\S+)\\s*$`);
const SEP = /^ {2}-{20,}/;

/** The setup paths of a report_timing_summary report ("Max Delay Paths" of each clock), slowest first. */
export function parseVivadoPaths(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const paths = [];
  let inMax = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^Max Delay Paths/.test(lines[i])) { inMax = true; continue; }
    if (/^(Min Delay Paths|Pulse Width Checks)/.test(lines[i])) { inMax = false; continue; }
    const s = new RegExp(`^Slack \\((?:MET|VIOLATED)\\) : +${NUM}ns`).exec(lines[i]);
    if (!inMax || !s) continue;
    const head = {};
    let j = i + 1;
    for (; j < lines.length && !/^ {4}Location +Delay type/.test(lines[j]) && !/^Slack/.test(lines[j]); j++) {
      const f = /^ {2}([A-Z][\w ]+?): +(.*)$/.exec(lines[j]);
      if (f && !(f[1] in head)) head[f[1]] = f[2].trim();
    }
    if (!/^ {4}Location/.test(lines[j] || '') || !/^Setup/.test(head['Path Type'] || '')) continue;
    // the source clock's path to the first separator after the table's, then the data path to the next
    let seps = 0;
    for (j++; j < lines.length && seps < 2; j++) if (SEP.test(lines[j])) seps++;
    const stages = [];
    let end = null;
    for (; j < lines.length && !SEP.test(lines[j]); j++) {
      let m = CELL.exec(lines[j]);
      if (m) {
        const res = m[6], pin = PIN.exec(res)?.[0].slice(1) ?? '', cell = res.replace(PIN, '');
        stages.push({ kind: stages.length ? 'logic' : 'clock-to-out', type: m[3], inst: cell, pin, site: m[1], cellType: m[2], delay: +m[4], resources: [res] });
        continue;
      }
      if ((m = NET.exec(lines[j]))) { stages.push({ kind: 'net', type: 'net', inst: stages.at(-1)?.inst ?? null, pin: '', site: null, delay: +m[1], net: m[3], resources: [] }); continue; }
      if ((m = END.exec(lines[j]))) end = { site: m[1], cell: m[3].replace(PIN, ''), pin: PIN.exec(m[3])?.[0].slice(1) ?? '' };
    }
    // the destination's setup (the capture clock's path, after the data path): its time, its sign turned
    let setupNs = 0;
    for (; j < lines.length && !/^ {25}required time/.test(lines[j]); j++) {
      const m = SETUP.exec(lines[j]);
      if (m) setupNs = -m[4];
    }
    if (!stages.length || !end) continue;
    // (each net's site: its load's, the next stage's or the end's)
    stages.forEach((st, k) => { if (st.kind === 'net') { const next = stages[k + 1]; st.site = next?.site ?? end.site; st.inst = next?.inst ?? end.cell; st.pin = next ? '' : end.pin; } });
    stages.push({ kind: 'setup', type: 'setup', inst: end.cell, pin: end.pin, site: end.site, delay: +setupNs.toFixed(3), resources: [end.cell] });
    let arrival = 0;
    for (const st of stages) {
      arrival = +(arrival + st.delay).toFixed(3);
      st.arrival = arrival;
      st.signals = [...new Set((st.kind === 'net' ? [st.net] : st.resources).map(vivadoSignal).filter(Boolean).flatMap(variants))];
      st.sources = [];
    }
    const num = k => { const v = new RegExp(`^${NUM}ns`).exec(head[k] || ''); return v ? +v[1] : null; };
    const clock = /clocked by (\S+)/.exec(lines.slice(i, i + 6).join('\n'))?.[1] ?? null;
    // (between the clock's two edges: "(clk fall@5.000ns - clk rise@0.000ns)")
    const edges = [...(head.Requirement || '').matchAll(/(rise|fall)@/g)].map(x => x[1]);
    const half = edges.length === 2 && edges[0] !== edges[1];
    const delay = arrival;
    paths.push({ clock, port: null, required: num('Requirement'), delay, period: +(delay * (half ? 2 : 1)).toFixed(3), half, slack: +s[1],
      from: head.Source.replace(PIN, ''), to: head.Destination.replace(PIN, ''), end: `${end.site}.${end.pin}`, stages, lines: [] });
    i = j;
  }
  return { paths: paths.sort((a, b) => b.period - a.period || a.slack - b.slack) };
}

/** Vivado's timing paths of a project: its report's, each stage back to the project's HDL (sources: [{ path, lang,
 *  text }], the design's; a source that does not compile leaves the paths with no lines). */
export function vivadoTimingPaths(text, sources, top) {
  let where = () => [];
  try { where = upward(signalDrivers(compile(sources.filter(s => s.lang === 'vhdl' || s.lang === 'verilog')), top)); } catch { /* not compiled: no lines */ }
  return { top, toolchain: 'vivado', ...twrSources(parseVivadoPaths(text), where) };
}
