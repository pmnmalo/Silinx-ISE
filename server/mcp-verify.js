// The MCP server's Verify (#3177, server/mcp.js): a module's equivalence with a reference module, proved by Yosys's SAT
// solver as the interface's Verify Equivalence process proves it (core/verify.js, the same messages); a difference: the
// counterexample's test bench written into the project (core/verify-bench.js, sim/verify_<module>) and replayed by the
// simulator, whose messages show the same difference.
import * as P from './projects.js';
import { toolError, readProject, viewSourcesOf, STR, PROJECT } from './mcp-util.js';

export const VERIFY_TOOLS = [
  {
    name: 'verify', title: 'Verify Equivalence',
    description: 'Prove that a module gives the same outputs as a reference module (a teacher\'s solution, an earlier version) for every input sequence, as the Verify Equivalence process does: Yosys\'s SAT solver checks the two modules side by side clock cycle by clock cycle from their initial state (registers with no initial value start at 0), up to depth cycles, and tries a proof by induction at each depth. The result: proved (for every input sequence), bounded (no difference in the first depth cycles, not proved beyond) or failed: the first clock cycle where an output differs, with the counterexample (the inputs of each cycle and both modules\' outputs) written as a test bench, sim/verify_<module>, that replays it in the simulator (simulate with that top shows the same difference; its waves in the waveform viewer). Both modules need the same ports (names, directions, widths); VHDL and Verilog alike, either may be a simulation-only source.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, module: STR('The module to verify (default: the project\'s top).'), reference: STR('The reference module: the outputs it must give.'),
      depth: { type: 'integer', description: 'How many clock cycles the check covers at most (default 20, at most 1000).' },
      language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'The counterexample\'s test bench\'s language (default: the module\'s).' },
      test_bench: { type: 'boolean', description: 'Write the counterexample\'s test bench and replay it (default true).' },
    }, required: ['project', 'reference'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(a) {
      const name = a.project;
      const pj = await readProject(name);
      const V = await import('../core/verify.js');
      const { counterexampleBench, benchName } = await import('../core/verify-bench.js');
      const { yosysNode } = await import('../packages/silinx-fpga/src/node.js');
      const top = a.module ?? pj.top;
      if (!top) throw toolError('module: the project has no top module: name the module to verify');
      const depth = a.depth ?? V.VERIFY_DEPTH;
      // the simulation view's sources: the design's, the drawings' HDL and the simulation-only files (a reference), but
      // an earlier counterexample's test bench (of ports that may have changed since)
      const srcs = (await viewSourcesOf(name, pj, true)).filter(s => !V.isVerifyBench(s.text));
      const r = await V.verifyEquivalence(srcs, { top, reference: a.reference, depth, run: yosysNode });
      let bench = null, replay = [];
      if (r.status === 'failed' && a.test_bench !== false) {
        const lang = a.language || r.lang;
        const tb = benchName(r.top);
        bench = `sim/${tb}.${lang === 'vhdl' ? 'vhd' : 'v'}`;
        // (a file of that path, or a module of that name, of the user's: left as it is)
        const all = await P.readSources(name);
        const mine = all.find(s => s.path === bench);
        if (mine && !V.isVerifyBench(mine.text)) throw toolError(`${bench} exists and is not a test bench of Verify: rename it, or give test_bench false`);
        const { compile } = await import('../core/compile.js');
        const other = [...compile(all.filter(s => !s.missing && !V.isVerifyBench(s.text) && (s.lang === 'vhdl' || s.lang === 'verilog'))).modules.values()].find(m => m.name.toLowerCase() === tb.toLowerCase());
        if (other) throw toolError(`A module named '${tb}' already exists (${other.file}): rename it, or give test_bench false`);
        const text = counterexampleBench(r, { name: tb, lang });
        // (the earlier one in the other language: replaced by this one, two modules of one name otherwise)
        const twin = all.find(s => s.path === `sim/${tb}.${lang === 'vhdl' ? 'v' : 'vhd'}` && V.isVerifyBench(s.text));
        if (twin) await P.deleteFile(name, twin.path);
        await P.writeFile(name, bench, text);
        // the replay: the test bench simulated on the sources
        const { simulate } = await import('../core/compile.js');
        const { primitiveSources } = await import('../core/unisim.js');
        const tbSrc = { path: bench, lang, text, role: 'sim' };
        const s = simulate([...primitiveSources([...srcs, tbSrc]), ...srcs, tbSrc], tb, { until: 1e15 });
        replay = s.errors.length ? s.errors.slice(0, 3).map(e => `ERROR: ${e.file}:${e.line} ${e.message}`) : s.sim.log.map(l => l.text);
      }
      const messages = V.verifyMessages(r, { bench });
      const lines = messages.map(m => m.text.trim()).filter(Boolean);
      if (replay.length) lines.push(`Simulation of ${benchName(r.top)}:`, ...replay.map(l => `  ${l}`));
      const data = { project: name, module: r.top ?? top, reference: r.reference ?? a.reference, status: r.status, depth,
        ...(r.status === 'proved' ? { induction: r.induction } : {}),
        ...(r.status === 'failed' ? { cycle: r.cycle, differs: r.differs, counterexample: r.cycles, testBench: bench, replay } : {}),
        errors: r.errors, warnings: r.warnings };
      return { text: lines.join('\n'), data, isError: r.status === 'error' };
    },
  },
];
