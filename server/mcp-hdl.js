// The MCP server's tools of the HDL (server/mcp.js, #134): Check Syntax and the behavioural simulation.
import { toolError, clip, elaborateView, diagLine, diagJson, STR, PROJECT } from './mcp-util.js';

export const HDL_TOOLS = [
  {
    name: 'check_syntax', title: 'Check Syntax',
    description: 'Parse and elaborate the design (or, with simulation, the test bench) as the application\'s Check Syntax does: the errors and warnings with their file and line, the design checks (latches, sensitivity lists, unused signals…) included.',
    inputSchema: { type: 'object', properties: { project: PROJECT, top: STR('The module to elaborate (default: the project\'s top, or its test bench with simulation).'), simulation: { type: 'boolean', description: 'Check the simulation view (the test bench and the design).' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, top, simulation = false }) {
      const { design, top: mod, diags } = await elaborateView(name, { top, sim: simulation });
      const errors = diags.filter(d => d.severity === 'error'), warnings = diags.filter(d => d.severity !== 'error');
      const ok = !errors.length && !!design?.top;
      const lines = [...diags.map(diagLine),
        ok ? `Process "Check Syntax" of <${mod}> completed successfully${warnings.length ? ` with ${warnings.length} warning(s)` : ''} (${design.signals.length} signals, ${design.procs.length} processes).`
          : `Process "Check Syntax" of <${mod}> failed (${errors.length} error(s), ${warnings.length} warning(s)).`];
      return { text: lines.join('\n'), data: { project: name, top: mod, ok, errors: errors.map(diagJson), warnings: warnings.map(diagJson) }, isError: false };
    },
  },
  {
    name: 'simulate', title: 'Simulate Behavioral Model',
    description: 'Run the behavioural simulation of the project\'s test bench (or another top) for a time: its messages (report / $display, assertions), where it stopped, and the values of signals (the test bench\'s by default; hierarchical names as tb/uut/count) with their changes.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, top: STR('The simulation top (default: the project\'s test bench).'),
      time_ns: { type: 'number', description: 'How long to simulate, in ns (default 1000; at most 1e9).' },
      signals: { type: 'array', items: { type: 'string' }, description: 'The signals to return (names of the top, or paths through instances: uut/count).' },
      max_changes: { type: 'integer', description: 'The changes of each signal returned at most (default 20, the last ones).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, top, time_ns: timeNs = 1000, signals, max_changes: maxChanges = 20 }) {
      if (!(timeNs > 0) || timeNs > 1e9) throw toolError('time_ns: from 0 to 1e9 ns');
      const { srcs, design, top: mod, diags } = await elaborateView(name, { top, sim: true });
      const errors = diags.filter(d => d.severity === 'error');
      if (errors.length || !design?.top) return { text: [...errors.map(diagLine), `The simulation of <${mod}> did not start: ${errors.length} error(s) (check_syntax with simulation).`].join('\n'), data: { project: name, top: mod, started: false, errors: errors.map(diagJson) }, isError: true };
      const { Simulator } = await import('../core/simulator.js');
      const V = await import('../core/values.js');
      const log = [];
      const sim = new Simulator(design, { files: new Map(srcs.map(s => [s.path, s.text])), onLog: e => { if (log.length < 500) log.push({ timeNs: e.time / 1000, kind: e.kind, text: e.text }); } });
      // the signals by name: the top's, then through its instances (uut/count)
      const byPath = new Map();
      const walk = (inst, prefix) => {
        for (const p of inst.ports || []) if (!byPath.has(prefix + p.name)) byPath.set(prefix + p.name, p.sig);
        for (const s of inst.signals || []) if (!byPath.has(prefix + s.name)) byPath.set(prefix + s.name, s);
        for (const c of inst.children || []) walk(c, `${prefix}${c.name}/`);
      };
      walk(design.top, '');
      const wanted = signals?.length ? signals : [...byPath.keys()].filter(k => !k.includes('/'));
      const unknown = wanted.filter(n => !byPath.has(n) && !byPath.has(String(n).toLowerCase()));
      if (unknown.length) throw toolError(`no signal ${unknown.map(n => `'${n}'`).join(', ')} in <${mod}> (names of the top, or paths as uut/count)`);
      const st = sim.run(timeNs * 1000);
      const fmt = (s, v) => (s.t?.w === 1 ? V.toBin(v) : `${V.toBin(v).length <= 16 ? `"${V.toBin(v)}"` : `x"${V.format(v, 'hex')}"`}`);
      const sigs = {};
      for (const n of wanted) {
        const s = byPath.get(n) ?? byPath.get(String(n).toLowerCase());
        const w = s.wave;
        const changes = w ? w.t.map((t, i) => [t / 1000, fmt(s, w.v[i])]) : [];
        sigs[n] = { width: s.t?.w ?? null, final: changes.length ? changes.at(-1)[1] : null, changes: changes.slice(-Math.max(1, maxChanges)), totalChanges: changes.length };
      }
      const failed = st.finished === 'error' || log.some(l => l.kind === 'error' || l.kind === 'failure');
      const stopped = `Simulation of <${mod}> stopped at ${st.now / 1000} ns${st.finished ? ` (${st.finished})` : ''}.`;
      const text = [...diags.filter(d => d.severity !== 'error').map(diagLine), ...log.map(l => `[${l.timeNs.toFixed(3)} ns] ${l.kind === 'print' ? '' : `${l.kind.toUpperCase()}: `}${l.text}`), stopped,
        ...Object.entries(sigs).map(([n, s]) => `${n} = ${s.final ?? '(no value)'}${s.totalChanges > 1 ? ` (${s.totalChanges} changes)` : ''}`)].join('\n');
      return { text: clip(text), data: { project: name, top: mod, started: true, stoppedAtNs: st.now / 1000, finished: st.finished || null, failed, log, signals: sigs, warnings: diags.filter(d => d.severity !== 'error').map(diagJson) }, isError: false };
    },
  },
];
