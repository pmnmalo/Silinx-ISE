// The MCP server's Test Bench Wizard (server/mcp.js, #2674), as the interface's wizard makes a self-checking test bench
// (web/js/tbwizard.js, tbwizard-vectors.js) through core/testbench.js: the module's ports, its clock and reset (guessed
// as the wizard guesses them, or given), the input vectors (every combination, random, counting, walking ones and
// zeros, given, or none: a skeleton), their expected outputs given or taken from a simulation of the design (Fill
// Expected from Current Design: a regression test), the test bench reporting each mismatch and TEST PASSED / FAILED.
import * as P from './projects.js';
import { toolError, readProject, viewSourcesOf, STR, PROJECT } from './mcp-util.js';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const MODES = ['exhaustive', 'random', 'count', 'walking', 'vectors', 'none'];

export const TEST_BENCH_TOOLS = [
  {
    name: 'test_bench_wizard', title: 'Test Bench Wizard',
    description: 'Make a self-checking test bench of a module, as the Test Bench Wizard does: it applies input vectors to the module and compares its outputs with the expected values, reporting each mismatch and TEST PASSED / TEST FAILED (run it with simulate). The clock and the reset are guessed from the ports (clk, rst…) or given ("" for none: a combinational test). The vectors: exhaustive (every combination), random, count, walking (ones and zeros), vectors (given: { inputs: { port: value }, drive: { inout port: value or Z }, expected: { port: value } }; values binary 0101, hex 0x1F, decimal d12; - or x a bit not checked) or none (a skeleton). expected: design takes the expected outputs from a simulation of the module as it is (a regression test), none leaves them unchecked (only reported).',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, module: STR('The module to test (default: the project\'s top).'), name: STR('The test bench\'s name (default tb_<module>).'),
      language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'Its language (default: the project\'s Preferred Language).' }, location: STR('Its folder (default sim).'),
      clock: STR('The clock port, or "" for none (default: guessed).'), period_ns: { type: 'number', description: 'The clock\'s period (default 20 ns).' },
      reset: STR('The reset port, or "" for none (default: guessed).'), reset_active: { type: 'string', enum: ['1', '0'], description: 'The reset\'s active level (default: guessed).' },
      reset_cycles: { type: 'integer', description: 'How long the reset is applied, in clock cycles (default 2).' }, settle_ns: { type: 'number', description: 'A combinational test\'s settling time (default 10 ns).' },
      stimulus: { type: 'string', enum: MODES, description: 'The vectors (default exhaustive, random when there are too many).' },
      count: { type: 'integer', description: 'random and count: how many vectors (default 32).' }, seed: { type: 'integer', description: 'random: the seed (default 1).' },
      vectors: { type: 'array', items: { type: 'object' }, description: 'stimulus vectors: the vectors, each { inputs, drive, expected }.' },
      expected: { type: 'string', enum: ['design', 'none'], description: 'The expected outputs of generated vectors: design (a simulation of the module) or none (default; given vectors keep their own).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(a) {
      const name = a.project;
      const pj = await readProject(name);
      const T = await import('../core/testbench.js');
      const { compile, elaborate, simulate } = await import('../core/compile.js');
      const { primitiveSources } = await import('../core/unisim.js');
      const { clocksOf } = await import('../core/schematic.js');
      const { reservedError } = await import('../core/reserved.js');
      const { typeText } = await import('../core/type-text.js');
      // the design sources (the drawings' HDL among them), as the wizard's
      const design = (await viewSourcesOf(name, pj, false)).filter(s => (s.role || 'design') === 'design');
      const lib = compile(design);
      const mods = [...lib.modules.values()].filter(m => m.kind !== 'package');
      if (!mods.length) throw toolError('The project has no design modules to test.');
      const uut = mods.find(m => m.name.toLowerCase() === String(a.module ?? pj.top ?? '').toLowerCase()) || (a.module ? null : mods[0]);
      if (!uut) throw toolError(`no design module '${a.module}' in the project`);
      const tbName = String(a.name ?? `tb_${uut.name}`).trim();
      const lang = a.language || pj.preferredLanguage || uut.lang || 'vhdl';
      if (!NAME_RE.test(tbName)) throw toolError('Enter a valid test bench name (a letter, then letters, digits and _).');
      const r = reservedError(tbName);
      if (r) throw toolError(`${r}: choose another name.`);
      const loc = String(a.location ?? 'sim').trim().replace(/\/+$/, '');
      if (!/^[A-Za-z0-9_/-]+$/.test(loc) || loc.split('/').some(s => !s || s.startsWith('.')) || /^build(\/|$)/i.test(loc)) throw toolError('Invalid location.');
      const path = `${loc}/${tbName}.${lang === 'vhdl' ? 'vhd' : 'v'}`;
      // a module of that name in another file: refused; the file itself is not replaced either
      const all = [...compile((await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'))).modules.values()];
      if (all.some(m => m.name.toLowerCase() === tbName.toLowerCase() && m.file !== path)) throw toolError(`A module named '${tbName}' already exists.`);
      if ((await P.fileTree(name)).includes(path)) throw toolError(`${path} already exists: choose another name.`);
      // the module's ports, its clocks (the wizard's analyse)
      const d = elaborate(compile([...primitiveSources(design), ...design]), uut.name);
      if (!d.top) throw toolError(`'${uut.name}' cannot be elaborated: ${[...lib.errors, ...d.diags].filter(x => x.severity === 'error').slice(0, 3).map(x => x.message).join('; ')}`);
      const ports = T.tbPorts(d, Object.fromEntries(uut.ports.map(p => [p.name, typeText(p.type, uut.lang)])));
      const bad = ports.filter(p => p.kind === 'other' || (p.dir === 'inout' && p.kind === 'int'));
      if (bad.length) throw toolError(`The wizard cannot drive these ports: ${bad.map(p => `${p.name} (type)`).join(', ')}.`);
      const clockSigs = new Set();
      const visit = inst => { for (const pr of inst.procs || []) for (const c of clocksOf(pr).clocks) clockSigs.add(c); (inst.children || []).forEach(visit); };
      visit(d.top);
      const clkNames = new Set(d.top.ports.filter(p => clockSigs.has(p.sig)).map(p => p.name));
      const g = T.guessClockReset(ports, clkNames);
      const st = { clock: g.clock || '', period: 20, reset: g.reset || '', active: g.resetActive, cycles: 2, settle: 10 };
      if (!clockSigs.size && !clkNames.size) st.clock = '';
      if (a.clock !== undefined) st.clock = a.clock;
      if (a.reset !== undefined) st.reset = a.reset;
      if (a.reset_active !== undefined) st.active = a.reset_active;
      if (a.period_ns !== undefined) st.period = a.period_ns;
      if (a.reset_cycles !== undefined) st.cycles = Math.max(1, a.reset_cycles);
      if (a.settle_ns !== undefined) st.settle = a.settle_ns;
      const single = ports.filter(p => p.dir === 'in' && p.kind === 'sl').map(p => p.name);
      for (const [what, v] of [['clock', st.clock], ['reset', st.reset]]) if (v && !single.includes(v)) throw toolError(`${what}: '${v}' is not a one-bit input of ${uut.name} (${single.join(', ') || 'none'})`);
      if (st.clock && st.clock === st.reset) throw toolError('The clock and the reset must be different ports.');
      if (st.clock && !(st.period >= 2)) throw toolError('The clock period must be at least 2 ns.');
      if (!st.clock && !(st.settle >= 1)) throw toolError('The settling time must be at least 1 ns.');
      const special = new Set([st.clock, st.reset].filter(Boolean));
      const ins = ports.filter(p => p.dir === 'in' && !special.has(p.name)), outs = ports.filter(p => p.dir === 'out'), ios = ports.filter(p => p.dir === 'inout');
      const chk = [...outs, ...ios];
      const bits = [...ins, ...ios].reduce((n, p) => n + p.width, 0);
      const exhaustive = 2 ** bits * (ios.length ? 2 : 1);
      let mode = a.stimulus || (exhaustive > T.MAX_VECTORS ? 'random' : 'exhaustive');
      if (mode === 'exhaustive' && exhaustive > T.MAX_VECTORS) throw toolError(`stimulus exhaustive: ${exhaustive} vectors, more than ${T.MAX_VECTORS} (random, count or walking)`);
      if ((mode === 'vectors') !== (a.vectors !== undefined)) throw toolError(mode === 'vectors' ? 'stimulus vectors: give the vectors' : 'vectors: with stimulus vectors');
      if (mode === 'none' && a.expected === 'design') throw toolError('expected design: a skeleton has no vectors');
      const opts = (vectors, extra = {}) => ({ name: tbName, lang, uut: { name: uut.name, params: [] }, ports, vectors,
        clock: st.clock ? { port: st.clock, periodNs: st.period } : null, reset: st.reset ? { port: st.reset, active: st.active, cycles: st.cycles } : null, settleNs: st.settle, ...extra });
      let text, vectors = [];
      if (mode === 'none') text = T.generateSkeleton(opts([]));
      else {
        // the rows as the wizard's table holds them, then as bits (its vectorsBits)
        const count = Math.max(1, Math.min(T.MAX_VECTORS, a.count ?? 32));
        const rows = mode === 'vectors' ? a.vectors.map(v => ({ in: { ...(v?.inputs || {}) }, drv: { ...(v?.drive || {}) }, exp: { ...(v?.expected || {}) } }))
          : T.makeVectors([...ins, ...ios], { mode, count, seed: a.seed ?? 1 }).map(v => ({ in: { ...v.in }, drv: Object.fromEntries(ios.map(p => [p.name, /Z/.test(v.drv?.[p.name] || 'Z') ? 'Z' : T.showValue(v.drv[p.name], p.width)])), exp: {} }));
        if (!rows.length) throw toolError('vectors: none given');
        if (rows.length > T.MAX_VECTORS) throw toolError(`vectors: at most ${T.MAX_VECTORS}`);
        const known = new Set(ports.map(p => p.name));
        for (const [k, row] of rows.entries()) for (const n of [...Object.keys(row.in), ...Object.keys(row.drv), ...Object.keys(row.exp)]) if (!known.has(n) || special.has(n)) throw toolError(`vector ${k}: no port '${n}' to set or check`);
        const toBits = withExp => rows.map((row, k) => {
          const v = { in: {}, drv: {}, exp: {} };
          for (const p of ins) {
            let b;
            try { b = T.parseValue(row.in[p.name], p.width); } catch (e) { throw toolError(`vector ${k}, input ${p.name}: ${e.message}`); }
            if (b != null && /-/.test(b)) throw toolError(`vector ${k}, input ${p.name}: an input cannot be '-'`);
            v.in[p.name] = b ?? '0'.repeat(p.width);
          }
          for (const p of ios) { try { v.drv[p.name] = T.parseDrive(row.drv?.[p.name], p.width); } catch (e) { throw toolError(`vector ${k}, ${p.name} (drive): ${e.message}`); } }
          if (withExp) for (const p of chk) { try { v.exp[p.name] = T.parseValue(row.exp[p.name], p.width); } catch (e) { throw toolError(`vector ${k}, expected ${p.name}: ${e.message}`); } }
          return v;
        });
        if (a.expected === 'design') {
          // Fill Expected from Current Design: the test bench with a trace, simulated on the design
          const traced = `${tbName}_trace`;
          const tb = { path: `${traced}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: T.generateTestbench(opts(toBits(false), { name: traced, trace: true })) };
          const s = simulate([...primitiveSources([...design, tb]), ...design, tb], traced, { until: 1e15 });
          if (s.errors.length) throw toolError(`Cannot simulate the design: ${s.errors.slice(0, 3).map(e => `${e.file}:${e.line} ${e.message}`).join('\n')}`);
          const exp = T.expectedFromTrace(s.sim.log.map(l => l.text), chk, rows.length);
          if (exp.some(e => !e)) throw toolError('Cannot simulate the design: the simulation did not reach every vector');
          rows.forEach((row, k) => { for (const p of chk) row.exp[p.name] = T.showValue(exp[k][p.name], p.width); });
        }
        vectors = toBits(true);
        try { text = T.generateTestbench(opts(vectors)); } catch (e) { throw toolError(e.message); }
      }
      await P.writeFile(name, path, text);
      const nexp = vectors.filter(x => chk.some(p => x.exp[p.name] && /[01]/.test(x.exp[p.name]))).length;
      const lines = [`Test Bench Wizard: created ${path} (${lang === 'vhdl' ? 'VHDL' : 'Verilog'}), the test bench ${tbName} of ${uut.name}.`,
        st.clock ? `Clock: ${st.clock}, ${st.period} ns${mode === 'none' ? '' : ' (sequential test, one vector per clock cycle)'}` : `Combinational test${mode === 'none' ? '' : `, settling time ${st.settle} ns`}`,
        st.reset ? `Reset: ${st.reset}, active '${st.active}' for ${st.cycles} ${st.clock ? 'clock cycle(s)' : 'x 10 ns'}` : 'Reset: none',
        mode === 'none' ? 'Vectors: none — a skeleton: write the stimulus (set the inputs, wait, check the outputs) where the comments show.'
          : `Vectors: ${vectors.length} (${mode}); expected values: ${nexp ? `${nexp} vector(s) checked` : 'none (the outputs are only reported)'}.`,
        'Run it with simulate (top: the test bench): the log shows each mismatch and TEST PASSED / TEST FAILED.'];
      return { text: lines.join('\n'), data: { project: name, path, testBench: tbName, module: uut.name, clock: st.clock || null, reset: st.reset || null, vectors: vectors.length, checked: nexp } };
    },
  },
];
