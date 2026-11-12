// The MCP server's tools of the processes (server/mcp.js, #134): running a process, reading its reports.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, clip, redactor, projectPath, readProject, PROJECT } from './mcp-util.js';
import { MODEL_PROCESS, hasSimModels, noSimModelMessage } from './mcp-hdl.js';

export const PROCESSES = {
  synthesize: ['synth'],
  implement: ['synth', 'translate', 'map', 'par'],
  bitstream: ['synth', 'translate', 'map', 'par', 'bitgen'],
  timing: ['synth', 'translate', 'map', 'par', 'trce'],
  power: ['synth', 'translate', 'map', 'par', 'xpwr'],
  pins: ['synth', 'translate', 'map', 'par', 'pin2ucf'],
  // the simulation models (Generate Post-… Simulation Model, #2674): the flow up to their stage, then the model
  post_synthesis_model: ['synth', 'postsynth'],
  post_translate_model: ['synth', 'translate', 'posttrans'],
  post_map_model: ['synth', 'translate', 'map', 'postmap'],
  post_par_model: ['synth', 'translate', 'map', 'par', 'postpar'],
};
// a report of the build folder: its file, by the toolchain of the last run (#460: the Silinx toolchain
// writes Yosys's statistics, no map or par report: those two are made from its Design Summary)
export const REPORT_FILES = {
  open: {
    power: top => `build/${top}.pwr`,
    timing: () => 'build/open/timing.txt',
    synthesis: top => `build/open/${top}_stat.txt`,
    map: null,
    par: null,
    pins: top => `build/${top}_pins.ucf`,
    drc: null,
  },
  ise: {
    power: top => `build/${top}.pwr`,
    timing: top => `build/${top}.twr`,
    synthesis: top => `build/${top}.syr`,
    map: top => `build/${top}_map.mrp`,
    par: top => `build/${top}.par`,
    pins: top => `build/${top}_pins.ucf`,
    drc: null,
  },
  // AMD Vivado's (the 7-series, #1649, server/vivado.js): report_utilization after synthesis and after routing,
  // report_route_status, report_timing_summary, report_power, report_io, report_drc
  vivado: {
    power: top => `build/${top}_power.rpt`,
    timing: top => `build/${top}_timing.rpt`,
    synthesis: top => `build/${top}_synth_util.rpt`,
    map: top => `build/${top}_util.rpt`,
    par: top => `build/${top}_route.rpt`,
    pins: top => `build/${top}_io.rpt`,
    drc: top => `build/${top}_drc.rpt`,
  },
};
const TOOLCHAIN_NAMES = { silinx: 'Silinx toolchain', ise: 'Xilinx ISE', vivado: 'AMD Vivado' };
// the map and par reports of a Silinx toolchain run, from its Design Summary (build/reports.json); the router's passes
// only when the engine counts them (nextpnr's do not, #2420)
export const OPEN_REPORTS = {
  map: r => r.map && [`Design summary (pack, Silinx toolchain) of ${r.top}:`, ...(r.map.utilization || []).map(u => `  ${u.name}: ${u.used}${u.total ? ` out of ${u.total} ${u.percent}%` : ''}`),
    `${r.map.errors ?? 0} error(s), ${r.map.warnings ?? 0} warning(s).`].join('\n'),
  // (the nets and PIPs when the routed design is XDL, the Xilinx families'; the timing's model when it is said, the 7-series'
  // nextpnr's estimate, #3146)
  par: r => r.par && [`Place and route (Silinx toolchain) of ${r.top}: ${r.par.routed ? 'all signals are completely routed' : `${r.par.unroutedSignals} signal(s) not routed`}${r.par.nets != null ? ` (${r.par.nets} nets, ${r.par.pips} PIPs${r.par.iterations != null ? `, ${r.par.iterations} passes` : ''})` : ''}.`,
    ...(r.timing ? [`Timing constraints: ${r.timing.met === false ? `not met (${r.timing.timingErrors})` : r.timing.met === null ? 'none' : 'all met'}${r.timing.minPeriodNs ? `; minimum period ${r.timing.minPeriodNs} ns (${r.timing.maxFreqMHz} MHz)` : ''}${r.timing.model ? `, ${r.timing.model}` : ''}.`] : [])].join('\n'),
};

/** run_process's text: the run's errors and warnings, then '…' and the end of its log, then its result; no '…' with
 *  nothing before it (#2795). */
export function processText({ errors, warnings, lines, head, logLines = 40 }) {
  return clip([...(errors.length || warnings.length ? [...errors, ...warnings, '…'] : []), ...lines.slice(-Math.max(1, logLines)), head].join('\n'));
}

/** A process of the project's top run to its end (or stopped after timeoutS): its log redacted, its errors and
 *  warnings, whether it ended well, its toolchain. Errors: tool errors. */
export async function runProcess(name, proc, { toolchain, timeoutS = 1800, signal } = {}) {
  const pj = await readProject(name);
  const steps = PROCESSES[proc];
  if (!steps) throw toolError(`process: one of ${Object.keys(PROCESSES).join(', ')}`);
  if (!pj.top) throw toolError(`the project '${name}' has no top module`);
  // (a model the flow does not make: refused, as simulate refuses it, #3707)
  const model = Object.keys(MODEL_PROCESS).find(m => MODEL_PROCESS[m] === proc);
  if (model && !hasSimModels(pj.device)) throw toolError(noSimModelMessage(pj.device, model));
  const { startImplementation } = await import('./impl-routes.js');
  let job;
  try { job = await startImplementation(name, { steps, ...(toolchain ? { toolchain } : {}) }); } catch (e) { throw toolError(e.message); }
  const end = Date.now() + timeoutS * 1000;
  while (job.status === 'running' && Date.now() < end && !signal?.aborted) await new Promise(r => setTimeout(r, 250));
  if (job.status === 'running') {
    const { cancelJob } = await import('./jobs.js');
    cancelJob(job.id);
    throw toolError(signal?.aborted ? `the process ${proc} was cancelled: stopped` : `the process ${proc} did not end in ${timeoutS} s: stopped`);
  }
  const redact = await redactor();
  const lines = job.lines.map(redact);
  // (Vivado's critical warnings too, #1649)
  const errors = lines.filter(l => /^ERROR/.test(l)), warnings = lines.filter(l => /^(CRITICAL )?WARNING/.test(l));
  const tc = ['silinx', 'vivado'].includes(job.meta?.toolchain) ? job.meta.toolchain : 'ise';
  return { top: pj.top, lines, errors, warnings, ok: job.status === 'ok', silinx: tc === 'silinx', toolchain: tc };
}

// run_process's bounds (#3408): how long it waits (then the process is stopped), the lines of the log returned
export const PROCESS_LIMITS = Object.freeze({ timeoutS: 7200, logLines: 1000 });

export const PROCESS_TOOLS = [
  {
    name: 'run_process', title: 'Run a process',
    description: 'Run a process of the project\'s top module and wait for it: synthesize, implement (translate, map, place & route), bitstream (Generate Programming File), timing (static timing), power (an estimate in the Silinx toolchain), pins (Back-annotate Pin Locations), post_synthesis_model / post_translate_model / post_map_model / post_par_model (Generate Post-… Simulation Model: simulate it with simulate model). With the Silinx toolchain (no ISE) by default when it is the configured one; toolchain: ise to use Xilinx ISE when it is configured. A 7-series device (Basys 3, Nexys A7) is implemented by AMD Vivado (toolchain vivado: its synth_design, opt_design, place_design, route_design, write_bitstream; no simulation models). Returns the errors, the warnings and the end of the log.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, process: { type: 'string', enum: Object.keys(PROCESSES), description: 'The process.' },
      toolchain: { type: 'string', enum: ['silinx', 'ise', 'vivado'], description: 'The toolchain (default: the project\'s synthesis tool, else Toolchain Settings).' },
      log_lines: { type: 'integer', description: `The lines of the end of the log returned (default 40; from 1 to ${PROCESS_LIMITS.logLines}).` },
      timeout_s: { type: 'integer', description: `How long to wait, in seconds (default 1800; from 1 to ${PROCESS_LIMITS.timeoutS}): then the process is stopped.` },
    }, required: ['project', 'process'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async run({ project: name, process: proc, toolchain, log_lines: logLines = 40, timeout_s: timeoutS = 1800 }, { signal } = {}) {
      if (!Number.isInteger(logLines) || logLines < 1 || logLines > PROCESS_LIMITS.logLines) throw toolError(`log_lines: from 1 to ${PROCESS_LIMITS.logLines}`);
      if (!Number.isInteger(timeoutS) || timeoutS < 1 || timeoutS > PROCESS_LIMITS.timeoutS) throw toolError(`timeout_s: from 1 to ${PROCESS_LIMITS.timeoutS} s`);
      const { top, lines, errors, warnings, ok, toolchain: tc } = await runProcess(name, proc, { toolchain, timeoutS, signal });
      const pj = { top };
      const head = `Process "${proc}" of <${pj.top}> ${ok ? `completed successfully${warnings.length ? ` with ${warnings.length} warning(s)` : ''}` : `failed (${errors.length} error(s), ${warnings.length} warning(s))`} (${TOOLCHAIN_NAMES[tc]}).`;
      return { text: processText({ errors, warnings, lines, head, logLines }),
        data: { project: name, process: proc, toolchain: tc, ok, errors, warnings, log: lines.slice(-Math.max(1, logLines)) }, isError: !ok,
        // (a failure's errors and log quote the design's names and files: the project's own text, #3681)
        untrusted: ok ? undefined : 'the process\'s messages, which quote the design\'s names and files' };
    },
  },
  {
    name: 'get_report', title: 'Read a report',
    description: 'The Design Summary of the last run (summary: the utilization, the timing, the files, as JSON), or the text of a report of the last run: synthesis, map, par, timing, power, pins, drc (with the Silinx toolchain: Yosys\'s statistics for synthesis, the pack and route summaries for map and par; with AMD Vivado: its utilization after synthesis and after routing, its route status, timing summary, power, I/O and DRC reports).',
    inputSchema: { type: 'object', properties: { project: PROJECT, report: { type: 'string', enum: ['summary', ...Object.keys(REPORT_FILES.ise)], description: 'The report (default summary).' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, report = 'summary' }) {
      const pj = await readProject(name);
      const redact = await redactor();
      if (report === 'summary') {
        const { projectReports } = await import('./impl-routes.js');
        const r = JSON.parse(redact(JSON.stringify(await projectReports(name))));
        if (r.available === false) return { text: `No report yet for '${name}': run a process (run_process).`, data: { project: name, report, available: false } };
        return { text: clip(JSON.stringify(r, null, 1)), data: { project: name, report, available: true, summary: r }, untrusted: 'the report' };
      }
      if (!Object.hasOwn(REPORT_FILES.ise, report)) throw toolError(`report: summary or one of ${Object.keys(REPORT_FILES.ise).join(', ')}`);
      // the toolchain of the last run (its Design Summary), else the files there are
      const { projectReports } = await import('./impl-routes.js');
      const summary = await projectReports(name).catch(() => ({ available: false }));
      const top = pj.top || 'top';
      const build = path.join(P.projectDir(name), 'build');
      const tc = summary.available !== false ? ({ open: 'silinx', vivado: 'vivado' })[summary.source] || 'ise'
        : fs.existsSync(path.join(build, 'run.tcl')) ? 'vivado' : fs.existsSync(path.join(build, `${top}.syr`)) ? 'ise' : 'silinx';
      const open = tc === 'silinx', who = TOOLCHAIN_NAMES[tc];
      const file = REPORT_FILES[open ? 'open' : tc][report]?.(top);
      if (!file) {
        const text = summary.available !== false && OPEN_REPORTS[report]?.(summary);
        if (text) return { text: redact(text), data: { project: name, report, toolchain: 'silinx', path: 'build/reports.json', available: true }, untrusted: 'the report' };
      } else {
        const full = await projectPath(name, file);
        if (fs.existsSync(full)) { const text = redact(await fsp.readFile(full, 'latin1')); return { text: clip(text), data: { project: name, report, toolchain: tc, path: file, available: true }, untrusted: 'the report' }; }
      }
      const proc = { synthesis: 'synthesize', map: 'implement', par: 'implement', timing: 'timing', power: 'power', pins: 'pins', drc: 'implement' }[report];
      return { text: summary.available === false && !fs.existsSync(path.join(P.projectDir(name), 'build')) ? `No ${report} report for '${name}': no process has run yet (run_process ${proc}).`
        : `No ${report} report for '${name}' from its last run (${who}${file ? `: ${file}` : ''}): run_process ${proc} first.`, data: { project: name, report, toolchain: tc, available: false } };
    },
  },
];
