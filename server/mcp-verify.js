// The MCP server's Verify (#3177, server/mcp.js): a module's equivalence with a reference module, proved by Yosys's SAT
// solver as the interface's Verify Equivalence process proves it (core/verify.js, the same messages); a difference: the
// counterexample's test bench written into the project (core/verify-bench.js, sim/verify_<module>) and replayed by the
// simulator, whose messages show the same difference. With no reference: the module's own assertions proved, as the
// Verify Assertions process proves them (core/verify-assert.js), a failure's counterexample replayed in the same way.
// With a property: a state diagram's or an ASM chart's property, as its Verify Property… proves it (core/verify-props.js).
import * as P from './projects.js';
import { toolError, readProject, viewSourcesOf, STR, PROJECT } from './mcp-util.js';

// a check that failed or could not run (#3681): its messages, and a counterexample's replay, quote the design's names
// and files and what it prints: the project's own text
const failed = r => (r.status === 'error' || r.status === 'failed' ? 'Verify\'s messages, which quote the design\'s names and files, and the replay\'s lines' : undefined);

export const VERIFY_TOOLS = [
  {
    name: 'verify', title: 'Verify Equivalence',
    description: 'Prove that a module gives the same outputs as a reference module (a teacher\'s solution, an earlier version) for every input sequence, as the Verify Equivalence process does: Yosys\'s SAT solver checks the two modules side by side clock cycle by clock cycle from their initial state (registers with no initial value start at 0), up to depth cycles, and tries a proof by induction at each depth. The result: proved (for every input sequence), bounded (no difference in the first depth cycles, not proved beyond) or failed: the first clock cycle where an output differs, with the counterexample (the inputs of each cycle and both modules\' outputs) written as a test bench, sim/verify_<module>, that replays it in the simulator (simulate with that top shows the same difference; its waves in the waveform viewer). Both modules need the same ports (names, directions, widths); VHDL and Verilog alike, either may be a simulation-only source. With no reference, the module\'s own assertions are proved instead, as the Verify Assertions process does (VHDL: assert … severity warning, error or failure; Verilog: assert (…), assume (…), and assert / assume property (@(posedge clk) [disable iff (r)] a |-> b or a |=> b)): proved, bounded, or failed: the first clock cycle where an assertion fails, with its message, and the counterexample\'s test bench (the module alone) whose simulation shows it. With a property (the module of a state diagram or an ASM chart), that property is proved instead, as Verify Property… does: never (state is never reached), reach (state is reached: the way there is the counterexample, its test bench), exclusive (outputs, 1 bit each, never 1 together); the test bench holds the drawing\'s HDL with the property as an assertion, which its simulation reports.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, module: STR('The module to verify (default: the project\'s top).'), reference: STR('The reference module: the outputs it must give (none: the module\'s own assertions are proved).'),
      depth: { type: 'integer', description: 'How many clock cycles the check covers at most (default 20, at most 1000).' },
      time_limit: { type: 'number', description: 'How many seconds the check may take at most (default 60, at most 3600), as the dialogs\' Time limit: Yosys is stopped when it passes, and the result is timeout, with the clock cycles checked by then with no failure (checked).' },
      language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'The counterexample\'s test bench\'s language (default: the module\'s).' },
      test_bench: { type: 'boolean', description: 'Write the counterexample\'s test bench and replay it (default true).' },
      property: { type: 'string', enum: ['never', 'reach', 'exclusive'], description: 'A property of the module\'s state diagram or ASM chart to prove instead, as Verify Property… does: never (the machine never reaches state), reach (it reaches state: the way there is the counterexample), exclusive (the 1-bit outputs are never 1 together).' },
      state: STR('The property\'s state (never, reach): its name in the drawing.'),
      outputs: { type: 'array', items: { type: 'string' }, description: 'The property\'s 1-bit outputs (exclusive): two or more.' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(a) {
      const name = a.project;
      const pj = await readProject(name);
      const V = await import('../core/verify.js');
      const A = await import('../core/verify-assert.js');
      const { counterexampleBench, benchName } = await import('../core/verify-bench.js');
      const { yosysNode } = await import('../packages/silinx-fpga/src/node.js');
      const top = a.module ?? pj.top;
      if (!top) throw toolError('module: the project has no top module: name the module to verify');
      const depth = a.depth ?? V.VERIFY_DEPTH;
      // (#3261: Yosys stopped after it, a worker thread of its own terminated)
      const timeLimit = a.time_limit ?? V.VERIFY_TIME_LIMIT;
      // the simulation view's sources: the design's, the drawings' HDL and the simulation-only files (a reference), but
      // an earlier counterexample's test bench (of ports that may have changed since)
      const srcs = (await viewSourcesOf(name, pj, true)).filter(s => !V.isVerifyBench(s.text));
      if (a.property && a.reference) throw toolError('give a reference or a property, not both');
      const Pr = await import('../core/verify-props.js');
      const drawing = a.property ? await drawingOf(name, top) : null;
      const r = a.property ? await Pr.verifyProperty(srcs, { drawing, property: a.property === 'exclusive' ? { kind: 'exclusive', outputs: a.outputs || [] } : { kind: a.property, state: a.state }, depth, timeLimit, run: yosysNode })
        : a.reference ? await V.verifyEquivalence(srcs, { top, reference: a.reference, depth, timeLimit, run: yosysNode })
          : await A.verifyAssertions(srcs, { top, depth, timeLimit, run: yosysNode });
      let bench = null, replay = [];
      const pb = a.property && r.status === 'failed' ? Pr.propertyBench(r) : null;
      if (r.status === 'failed' && a.test_bench !== false) {
        // (a property's: in the drawing's language, the drawing's HDL with the property in the same file)
        const lang = pb ? r.copy.lang : a.language || r.lang;
        const tb = pb ? pb.name : benchName(r.top);
        bench = `sim/${tb}.${lang === 'vhdl' ? 'vhd' : 'v'}`;
        // (a file of that path, or a module of that name, of the user's: left as it is)
        const all = await P.readSources(name);
        const mine = all.find(s => s.path === bench);
        if (mine && !V.isVerifyBench(mine.text)) throw toolError(`${bench} exists and is not a test bench of Verify: rename it, or give test_bench false`);
        const { compile } = await import('../core/compile.js');
        const other = [...compile(all.filter(s => !s.missing && !V.isVerifyBench(s.text) && (s.lang === 'vhdl' || s.lang === 'verilog'))).modules.values()].find(m => m.name.toLowerCase() === tb.toLowerCase());
        if (other) throw toolError(`A module named '${tb}' already exists (${other.file}): rename it, or give test_bench false`);
        const text = pb ? pb.text : counterexampleBench(r, { name: tb, lang });
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
      const messages = a.property ? Pr.propertyMessages(r, { bench }) : a.reference ? V.verifyMessages(r, { bench }) : A.assertMessages(r, { bench });
      const lines = messages.map(m => m.text.trim()).filter(Boolean);
      if (replay.length) lines.push(`Simulation of ${pb ? pb.name : benchName(r.top)}:`, ...replay.map(l => `  ${l}`));
      if (a.property) {
        const data = { project: name, module: r.module ?? top, property: r.property, status: r.status, holds: !!r.holds, depth,
          ...(r.status === 'proved' ? { induction: r.induction } : {}),
          ...(r.status === 'timeout' ? { timeLimit, checked: r.checked } : {}),
          ...(r.status === 'failed' ? { cycle: r.cycle, counterexample: r.cycles, testBench: bench, replay } : {}),
          errors: r.errors, warnings: r.warnings };
        return { text: lines.join('\n'), data, isError: r.status === 'error', untrusted: failed(r) };
      }
      const data = { project: name, module: r.top ?? top, reference: r.reference ?? a.reference ?? null, status: r.status, depth,
        ...(a.reference ? {} : { asserts: r.asserts, assumes: r.assumes }),
        ...(r.status === 'proved' ? { induction: r.induction } : {}),
        ...(r.status === 'timeout' ? { timeLimit, checked: r.checked } : {}),
        ...(r.status === 'failed' ? { cycle: r.cycle, ...(a.reference ? { differs: r.differs } : { failure: r.failure ?? null }), counterexample: r.cycles, testBench: bench, replay } : {}),
        errors: r.errors, warnings: r.warnings };
      return { text: lines.join('\n'), data, isError: r.status === 'error', untrusted: failed(r) };
    },
  },
];

// the state diagram or ASM chart of module `top` (its model), from the project's drawings (its folders but build/)
async function drawingOf(name, top) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = P.projectDir(name);
  const found = [];
  const walk = async sub => {
    for (const d of await fs.readdir(path.join(dir, sub), { withFileTypes: true }).catch(() => [])) {
      const rel = sub ? `${sub}/${d.name}` : d.name;
      if (d.isDirectory() && rel !== 'build' && !d.name.startsWith('.')) await walk(rel);
      else if (d.isFile() && /\.(fsm|asm)\.json$/i.test(d.name)) found.push(rel);
    }
  };
  await walk('');
  for (const rel of found.sort()) {
    let m;
    try { m = JSON.parse(await P.readFile(name, rel)); } catch { continue; }
    if (String(m?.name || '').toLowerCase() === String(top).toLowerCase()) return m;
  }
  throw toolError(`property: '${top}' is not the module of a state diagram or an ASM chart of the project`);
}
