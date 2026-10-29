// Silinx - the open flow's simulation models, the IDE's (core/open-flow-models.js until #1675: given to the flow as
// io.simModels by core/flow-ide.js runOpenFlow; #405: out of runOpenFlow in packages/silinx-fpga/src/open-flow-core.js, #120,
// #121, #122, #622): the design the models are made of (the test bench's generics), the post-synthesis,
// post-translate, post-map and post-place & route models, the board's model beside them.
import { analyzeTiming, pack, placeRouteBest, readYosysJson, synthesizeVerilog, StepError } from '../packages/silinx-fpga/src/index.js';
import { compile, elaborate } from './compile.js';
import { flowFrontEnd } from './synth-front.js';
import { dutGenerics, postMapModels, postParModels, postSynthesisModels, postTranslateModels, scalarVerilog } from './sim-model.js';
import { parseXdl, writeXdl } from '../packages/silinx-fpga/src/parts.js';
import { primitiveSources } from './unisim.js';

/** { runPostMap, runPostPar, runPostSynth, runPostTranslate } of runOpenFlow (netlist(), packed(), routedText(), synth(): its current values). */
export function mountSimModels(ctx) {
  const {
    io, spec, knownPips, log, netlist, packed, parTries, parExtra, report, routedOrEarlier, routedText, step, synth, top, ucfText
  } = ctx;

  // The design the simulation models are made of (#120, #121): synthesized with the generics the test bench
  // (spec.simTop) gives its instance of the top; without any, this run's synthesis, or (netlistOk: the
  // post-translate and post-map models) the netlist() Translate read. Once per run.
  let modelGen = null, modelSynth = null;
  async function modelDesign(netlistOk) {
    if (!modelGen) {
      const srcs = io.sources(), sims = io.simSources ? io.simSources() : [];
      modelGen = { generics: {}, testbench: null };
      if (spec.simTop && sims.length) {
        const all = [...srcs, ...sims];
        const tb = elaborate(compile([...primitiveSources(all), ...all]), spec.simTop);
        const g = tb.top ? dutGenerics(tb, top) : null;
        if (g) {
          modelGen = { generics: g.generics, testbench: spec.simTop };
          if (g.skipped.length) log(`WARNING:Silinx - the test bench '${spec.simTop}' gives ${g.skipped.join(', ')} values that are not integers: the model is synthesized with their defaults`);
        } else log(`INFO:Silinx - the test bench '${spec.simTop}' has no instance of '${top}': the model is synthesized with its own generics`);
      }
    }
    const { generics, testbench } = modelGen;
    const given = Object.keys(generics).length > 0;
    if (!given && (synth() || (netlistOk && netlist()))) return { synth: synth(), own: false, generics, testbench };
    if (!modelSynth) {
      if (given) log(`Synthesizing '${top}' with the generics the test bench '${testbench}' gives: ${Object.entries(generics).map(([k, v]) => `${k} = ${v}`).join(', ')}`);
      modelSynth = await synthesizeWith(generics);
    }
    return { synth: modelSynth, own: true, generics, testbench };
  }
  // the top synthesized with these generics, for a model
  async function synthesizeWith(generics) {
    const fe = flowFrontEnd(io.sources(), top, { generics });
    if (fe.errors.length) throw new StepError('the design has errors', fe.errors, 'Fix them (Check Syntax shows them in the Errors tab).');
    try { return await synthesizeVerilog(fe.input(), { family: spec.family, run: io.yosys, effort: spec.synthEffort || 'high' }); } catch (e) {
      for (const l of e.lines || []) if (/ERROR/.test(l)) log(l);
      throw new StepError(`synthesis failed: ${e.message}`);
    }
  }
  // a model's files, in the report and the log; `board`: the board's model (#622), when it is another
  function writeModel(step, dir, suffix, title, m, prims, count, board = null) {
    if (m.unknown.length) log(`WARNING:Silinx - ${/^post(map|par)$/.test(step) ? 'sites' : 'cells'} with no simulation model in Silinx (the model cannot be simulated as it is): ${m.unknown.join(', ')}`);
    const vhd = io.write(`netgen/${dir}/${top}_${suffix}.vhd`, m.vhdl);
    const v = io.write(`netgen/${dir}/${top}_${suffix}.v`, m.verilog);
    const sdf = m.sdf ? io.write(`netgen/${dir}/${top}_${suffix}.sdf`, m.sdf) : null;
    const { generics, testbench } = modelGen;
    let b = null;
    if (board) b = { path: io.write(`netgen/${dir}/${top}_${suffix}_board.vhd`, board.vhdl), verilog: io.write(`netgen/${dir}/${top}_${suffix}_board.v`, board.verilog) };
    report.simModels = { ...(report.simModels || {}), [step]: { path: vhd, verilog: v, ...(sdf ? { sdf } : {}), ...(testbench ? { testbench, generics } : {}), ...(b ? { board: b } : {}) } };
    log(`${title} Simulation Model: ${vhd} (VHDL, ${prims} primitives)${sdf ? `, ${v} (Verilog) and ${sdf} (SDF, the static timing's delays)` : ` and ${v} (Verilog)`}, ${count}`);
    if (b) log(`${title} model for the Board Emulator, with the design's own generics: ${b.path} (VHDL) and ${b.verilog} (Verilog)`);
  }
  // The board's model (#622). A model synthesized with a test bench's generics (blinky's divider of 2 instead of
  // 25 000 000) runs on the Board Emulator thousands of times too fast; the emulator runs the design's own beside
  // it, made of this run's implementation (or the last run's): its synthesis, netlist(), packing and routing. null
  // when the model has the design's own generics already, or that implementation is not there (an INFO).
  const ownText = () => (synth() ? synth().files[`${synth().top}.json`] : io.read(`open/${top}.json`));
  const withTestbench = d => d.own && Object.keys(d.generics).length > 0;
  function boardModel(d, title, make) {
    if (!withTestbench(d)) return null;
    try {
      const m = make();
      if (m) return m;
    } catch (e) { log(`INFO:Silinx - no ${title} model for the Board Emulator (${e.message}): it runs the test bench's`); return null; }
    log(`INFO:Silinx - no ${title} model for the Board Emulator (no implementation of '${top}' to make it of): it runs the test bench's`);
    return null;
  }
  // the synthesis of an earlier run, as synthesizeOpen's result: its netlist() and Verilog (the netlist()'s top: the
  // elaborated top's name, lower case for a VHDL top, #31); null when they are not in build/open
  function earlierSynth() {
    const text = io.read(`open/${top}.json`);
    if (text == null) return null;
    const mods = JSON.parse(text).modules || {};
    const name = Object.keys(mods).find(k => mods[k].attributes?.top) || top;
    const v = io.read(`open/${name}_yosys.v`);
    return v == null ? null : { top: name, files: { [`${name}.json`]: text, [`${name}_yosys.v`]: v } };
  }
  const ownNetlist = () => { if (netlist()) return netlist(); const t = ownText(); return t == null ? null : readYosysJson(t); };

  // Generate Post-Synthesis Simulation Model (#120): build/netgen/synthesis/<top>_synthesis.vhd (and .v)
  async function runPostSynth() {
    const d = await modelDesign(false);
    // (the Verilog a wire a bit, #575: scalarVerilog)
    const models = async (r, o) => {
      let split;
      try { split = await scalarVerilog(r, io.yosys); } catch (e) { throw new StepError(`the model's Verilog netlist: ${e.message}`); }
      return postSynthesisModels(split, o);
    };
    const m = await models(d.synth, { top, part: spec.part, generics: d.generics, testbench: d.testbench });
    // (the design's synthesis: this run's or the last run's files in build/open; none, the model's step alone:
    // the design synthesized with its own generics too)
    let own = null, ownM = null, ownErr = null;
    if (withTestbench(d)) {
      own = synth() || earlierSynth();
      if (!own) {
        log(`Synthesizing '${top}' with its own generics, for the Board Emulator`);
        own = await synthesizeWith({});
      }
      try { ownM = await models(own, { top, part: spec.part }); } catch (e) { ownErr = e; }
    }
    const board = boardModel(d, 'post-synthesis', () => { if (ownErr) throw ownErr; return ownM; });
    writeModel('postsynth', 'synthesis', 'synthesis', 'Post-Synthesis', m, 'UNISIM', `${m.cells} cells`, board);
  }
  // Generate Post-Translate / Post-Map Simulation Model (#121): build/netgen/translate/<top>_translate.vhd,
  // build/netgen/map/<top>_map.vhd (and .v): the netlist(), the packed() design, of SIMPRIM primitives
  let modelNl = null, modelPacked = null;
  async function modelNetlist() {
    const d = await modelDesign(true);
    if (!d.own) return { ...d, nl: netlist(), packed: packed() };
    modelNl ||= readYosysJson(d.synth.files[`${d.synth.top}.json`]);
    return { ...d, nl: modelNl };
  }
  async function runPostTranslate() {
    const d = await modelNetlist();
    const m = postTranslateModels(d.nl, { top, part: spec.part, generics: d.generics, testbench: d.testbench });
    const board = boardModel(d, 'post-translate', () => { const nl = ownNetlist(); return nl && postTranslateModels(nl, { top, part: spec.part }); });
    writeModel('posttrans', 'translate', 'translate', 'Post-Translate', m, 'SIMPRIM', `${m.instances} primitives`, board);
  }
  async function runPostMap() {
    const d = await modelNetlist();
    let p = d.packed;
    if (!p) {
      try { p = modelPacked ||= pack(d.nl, { ucf: ucfText, part: spec.part }); } catch (e) { throw new StepError(`packing failed: ${e.message}`); }
    }
    const m = postMapModels(d.nl, p, { top, part: spec.part, generics: d.generics, testbench: d.testbench });
    const board = boardModel(d, 'post-map', () => {
      const nl = ownNetlist();
      return nl && postMapModels(nl, packed() || pack(nl, { ucf: ucfText, part: spec.part }), { top, part: spec.part });
    });
    writeModel('postmap', 'map', 'map', 'Post-Map', m, 'SIMPRIM', `${m.instances} primitives`, board);
  }
  // Generate Post-Place & Route Simulation Model (#122): build/netgen/par/<top>_timesim.vhd (and .v), and its
  // timing build/netgen/par/<top>_timesim.sdf: the routed design (this run's, or the model's design placed and
  // routed as Place & Route does it), the delays of its static timing
  async function runPostPar() {
    const d = await modelNetlist();
    let text = null;
    if (!d.own) { routedOrEarlier(); text = routedText(); }
    else {
      let p;
      try { p = modelPacked ||= pack(d.nl, { ucf: ucfText, part: spec.part }); } catch (e) { throw new StepError(`packing failed: ${e.message}`); }
      let pr;
      try {
        pr = placeRouteBest(d.nl, p, io.device(), knownPips(), { seed: spec.seed || 1, tries: parTries(p.stats.slices), extra: parExtra(), effort: spec.effort || 1, replicate: spec.replicate !== false, routeIterations: spec.routeIterations || null, pack: { ucf: ucfText, part: spec.part } });
      } catch (e) { throw new StepError(`placement of the model's design failed: ${e.message}`, [], e.hint); }
      const r = pr.routed;
      if (r.errors.length || r.failed.length || r.overused) throw new StepError(`the model's design (synthesized with the test bench's generics) could not be routed: ${r.failed.length} net(s) not routed, ${r.overused || 0} routing node(s) shared`, [...r.errors, ...r.unreached.map(u => `${u.net} -> ${u.inst}.${u.pin}`)].slice(0, 50));
      text = writeXdl(r.design);
    }
    const design = parseXdl(text);
    const sta = analyzeTiming(design, io.device());
    const m = postParModels(d.nl || netlist() || readYosysJson(io.read(`open/${top}.json`)), design, { top, part: spec.part, generics: d.generics, testbench: d.testbench, conns: sta.conns });
    // (the board's: the implementation's routed design, the emulator runs it without its timing)
    const board = boardModel(d, 'post-place & route', () => {
      const nl = ownNetlist(), routed = routedText() ?? io.read('open/routed.xdl');
      if (!nl || routed == null) return null;
      const rd = parseXdl(routed);
      return postParModels(nl, rd, { top, part: spec.part, conns: analyzeTiming(rd, io.device()).conns });
    });
    writeModel('postpar', 'par', 'timesim', 'Post-Place & Route', m, 'SIMPRIM', `${m.instances} primitives${sta.period ? `, minimum period ${sta.period.toFixed(3)} ns` : ''}`, board);
  }

  return { runPostMap, runPostPar, runPostSynth, runPostTranslate };
}
