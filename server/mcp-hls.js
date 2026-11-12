// The MCP server's tools of a C or C++ source (Silinx HLS, server/mcp.js, #2674), as the C module's processes run them
// (web/js/c-source.js): C Simulation (its main() run, core/c-interp.js), C/RTL Co-simulation (the test bench's calls
// replayed on the HDL made from it, core/c-cosim.js), View C Synthesis Report (core/c-report.js), and the HDL and the
// state machine (an ASM chart) made from it; scheduled for the board's clock, the device's delays and multiplier
// blocks, the project's RTL blackboxes, as in the interface. Their messages as the Console's.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText } from './mcp-util.js';

const IS_C = /\.(c|cpp|cc|cxx)$/i;

// the C source, its HDL language and the options Silinx HLS schedules it with (the interface's hlsClock / hlsFamily /
// hlsMults and S.hls)
async function cContext(name, rel) {
  const pj = await readProject(name);
  if (typeof rel !== 'string' || !IS_C.test(rel)) throw toolError(`path: a C or C++ source of the project (.c, .cpp), not '${rel}'`);
  const text = await projectText(name, rel, `no file '${rel}' in the project '${name}'`);
  const { hlsClockOf, hlsFamilyOf, hlsMultsOf } = await import('../core/c-report.js');
  const { resolveBoard, findPart } = await import('./devices.js');
  const { blackboxesIn } = await import('../core/c-blackbox.js');
  const tree = await P.fileTree(name);
  const hls = await blackboxesIn(tree, f => P.readFile(name, f)).catch(() => null);
  const lang = pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl';
  return { pj, text, tree, lang, clock: hlsClockOf(pj.board ? resolveBoard(pj.board)?.board : null), family: hlsFamilyOf(pj.device), mults: hlsMultsOf(pj.device, findPart(pj.device?.part)), hls: hls || {} };
}

// the test bench's files (c-source.js tbFiles): the project's files its strings name
async function tbFiles(name, text, tree) {
  const { testBenchFiles } = await import('../core/c-interp-lib.js');
  return Object.fromEntries(await Promise.all(testBenchFiles(text, tree).map(async p => [p, await P.readFile(name, p)])));
}

const PATH = STR('The C or C++ source (e.g. src/fir.c).');

export const HLS_TOOLS = [
  {
    name: 'c_simulation', title: 'C Simulation',
    description: 'Run a C or C++ source\'s main() (its test bench) as C Simulation does: its output, what main() returned, how many calls of the top function it made; the files it writes stay in memory, the project\'s as they are.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: PATH }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, path: rel }) {
      const c = await cContext(name, rel);
      const { simulateC } = await import('../core/c-interp.js');
      const r = simulateC(c.text, { file: rel, files: await tbFiles(name, c.text, c.tree), ...c.hls });
      const out = r.output ? r.output.replace(/\n$/, '').split('\n') : [];
      const wrote = Object.keys(r.files || {});
      const lines = [...out, ...(wrote.length ? [`${wrote.length} file(s) written by the test bench, in memory (not saved to the project): ${wrote.slice(0, 5).join(', ')}${wrote.length > 5 ? ', …' : ''}`] : [])];
      if (!r.ok) {
        const why = r.error ? `line ${r.error.line}: ${r.error.message}` : r.diagnostics.filter(d => d.severity === 'error').map(d => `line ${d.line}: ${d.message}`).join('; ');
        // (the error and the output quote the source's names and what it printed: the project's own text, #3681)
        return { text: [...lines, `ERROR:SilinxC - "${rel}" ${why}`, 'Process "C Simulation" failed'].join('\n'), data: { project: name, path: rel, ok: false, output: out, error: why }, isError: true,
          untrusted: 'the C compiler\'s messages and the test bench\'s output, which quote the source\'s names' };
      }
      lines.push(`main() returned ${r.exitCode}; ${r.calls.length} call(s) of '${r.top || '?'}'.`, 'Process "C Simulation" completed successfully');
      return { text: lines.join('\n'), data: { project: name, path: rel, ok: true, output: out, exitCode: r.exitCode, calls: r.calls.length, top: r.top || null, filesWritten: wrote } };
    },
  },
  {
    name: 'c_cosimulation', title: 'C/RTL Co-simulation',
    description: 'Replay the C test bench\'s calls of the top function on the HDL made from it and compare, as C/RTL Co-simulation does (in the project\'s Preferred Language, or the one given): PASS or FAIL with each mismatch, and the latency in cycles.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: PATH, language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'The HDL\'s language (default: the project\'s Preferred Language).' } }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, path: rel, language }) {
      const c = await cContext(name, rel);
      const lang = language || c.lang;
      const L = lang === 'vhdl' ? 'VHDL' : 'Verilog';
      const { cosimulate } = await import('../core/c-cosim.js');
      const r = cosimulate(c.text, { file: rel, lang, files: await tbFiles(name, c.text, c.tree), clock: c.clock, family: c.family, mults: c.mults, ...c.hls });
      const lines = r.errors.map(e => `ERROR:SilinxC - "${rel}" ${e}`);
      if (!r.ok || r.errors.length) return { text: [...lines, 'Process "C/RTL Co-simulation" failed'].join('\n'), data: { project: name, path: rel, language: lang, ok: false, pass: false, errors: r.errors }, isError: true };
      lines.push(`C simulation: ${r.calls} call(s) of '${r.gen.top}' replayed on its ${L}.`);
      if (r.latency) lines.push(`Latency: ${r.latency.min} to ${r.latency.max} cycles (average ${r.latency.avg.toFixed(1)}).`);
      for (const m of r.mismatches.slice(0, 20)) lines.push(`ERROR:SilinxC - call ${m.call ?? '-'}, ${m.port}: the C gives ${m.expected}, the HDL ${m.got ?? 'X'}`);
      if (r.mismatches.length > 20) lines.push(`… ${r.mismatches.length - 20} more mismatch(es)`);
      lines.push(...(r.pass ? [`C/RTL co-simulation PASS: ${r.calls} call(s), the same results`, 'Process "C/RTL Co-simulation" completed successfully']
        : [`C/RTL co-simulation FAIL: ${r.mismatches.length} mismatch(es)`, 'Process "C/RTL Co-simulation" failed']));
      return { text: lines.join('\n'), data: { project: name, path: rel, language: lang, ok: true, pass: r.pass, calls: r.calls, latency: r.latency || null, mismatches: r.mismatches.slice(0, 20) }, isError: !r.pass };
    },
  },
  {
    name: 'c_synthesis_report', title: 'View C Synthesis Report',
    description: 'What a C or C++ source is made into, as View C Synthesis Report says it: the module (sequential, its states and register bits, or combinational; its control interface), the target clock, its ports, processes, functions, memories, loops (their pragmas, II and cycles) and multipliers, and its warnings (a path over the clock).',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: PATH }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, path: rel }) {
      const c = await cContext(name, rel);
      const { cToHdl } = await import('../core/c-hdl.js');
      const { cReportLines } = await import('../core/c-report.js');
      const r = cToHdl(c.text, { file: rel, lang: c.lang, clock: c.clock, family: c.family, mults: c.mults, ...c.hls });
      const diags = r.diagnostics.map(d => `${d.severity === 'error' ? 'ERROR' : 'WARNING'}:SilinxC - "${rel}" line ${d.line}: ${d.message}`);
      if (!r.ok) return { text: [...diags, 'Process "View C Synthesis Report" failed'].join('\n'), data: { project: name, path: rel, ok: false, diagnostics: r.diagnostics }, isError: true };
      const { lines, warnings } = cReportLines(r, { path: rel, lang: c.lang, clock: c.clock });
      return { text: [...diags, ...lines, ...warnings, 'Process "View C Synthesis Report" completed successfully'].join('\n'),
        data: { project: name, path: rel, ok: true, top: r.top, ports: r.ports, report: r.report, warnings: [...diags.filter(d => /^WARNING/.test(d)), ...warnings] } };
    },
  },
  {
    name: 'c_generated', title: 'The HDL or the ASM chart made from a C source',
    description: 'What Silinx HLS makes of a C or C++ source, read-only, as its badges show it: hdl (its VHDL or Verilog, in the project\'s Preferred Language) or asm (a sequential module\'s state machine as an ASM chart, its JSON).',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: PATH, what: { type: 'string', enum: ['hdl', 'asm'], description: 'hdl (default) or asm.' } }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, path: rel, what = 'hdl' }) {
      const c = await cContext(name, rel);
      if (what === 'asm') {
        const { cAsm } = await import('../core/c-asm.js');
        const r = cAsm(c.text, { file: rel, lang: c.lang, clock: c.clock, family: c.family, mults: c.mults, ...c.hls });
        if (!r.ok) throw toolError(`ERROR:SilinxC - "${rel}" ${r.diagnostics.filter(d => d.severity === 'error').map(d => `line ${d.line}: ${d.message}`).join('; ')}`);
        return { text: JSON.stringify(r.model, null, 2), data: { project: name, path: rel, what, module: r.model.name } };
      }
      if (what !== 'hdl') throw toolError('what: hdl or asm');
      const { viewHdl } = await import('../core/view-hdl.js');
      const r = viewHdl(rel, c.text, { lang: c.lang, clock: c.clock, family: c.family, hls: c.hls, mults: c.mults });
      if (!r.text) throw toolError(r.errors.join('; ') || `${rel} makes no HDL`);
      return { text: r.text, data: { project: name, path: rel, what, module: r.module, language: r.lang, sequential: !!r.sequential } };
    },
  },
];
