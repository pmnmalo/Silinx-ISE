// The open synthesis's depth-oriented mappings (#405: out of synthesizeOpen in core/synth-open.js): a mapping's run
// and, from the design as it was before its LUT mapping, the mappings made for speed, the fastest kept by DEPTH_RULE,
// their messages apart.
import { asText } from './synth-open-yosys.js';
import { criticalDelay, logicLevels } from './synth-open-path.js';
import { resynthStage } from './synth-open-resynth.js';
import {
  DEPTH_ABC, DEPTH_ABC2, DEPTH_ABC2_LUT4, DEPTH_ABC3, DEPTH_ABC_FILE, DEPTH_RULE, DEPTH_SOPB, FOLD_CE_FILE,
  FOLD_CE_MAP, FOLD_CE_MAP_FILE, LUT4_COSTS, LUT4_ONLY, LUT6_MAP, LUT6_MAP_FILE, LUT_LIB, LUT_LIB_FILE, MUXF_MAP,
  MUXF_MAP_FILE, PREMAP_FILE, SOPB_RULE, SPEED_ABC, SPEED_RULE, SRL_CELLS, SRL_CELLS_FILE,
  abc9RemapCommands, cellCounts, criticalEnables, foldRemapCommands, keepDepth, keepSecond, logicMemories, muxTrees,
  muxfRemapCommands, outputs, remapCommands, sliceCount, speedRemapCommands, utilization
} from './synth-open.js';

/** { withDepth } of synthesizeOpen (tryDepth(): its current values). */
export function mountDepth(ctx) {
  const {
    deepRule, depth, family, run, wide, withAbc9, withResynth, log, normal, quiet, speed, top, tryDepth
  } = ctx;

  // a mapping (its run's output) and, from the design as it was before its LUT mapping, the depth-oriented
  // one: the faster kept (DEPTH_RULE); its messages apart, only a warning of its own joins the log
  async function withDepth(out, say, seen, { measured = false } = {}) {
    // (a kept netlist's warnings: those the run before did not print, the netlist being the same before
    // the LUT mapping)
    const sayNew = l => { if (/^Warning:/.test(l) && !seen.includes(l)) { seen.push(l); say(l); } };
    if (!out[`${top}.json`]) throw Object.assign(new Error('Yosys wrote no netlist'), { lines: log });
    // (each netlist's slices, when the rule weighs them: packed once)
    const slicesOf = new Map();
    const slices = j => (slicesOf.has(j) ? slicesOf.get(j) : slicesOf.set(j, sliceCount(j, top)).get(j));
    const info = { tried: false, kept: false, ns: null, luts: null };
    // (the memories the run left to logic, #54: counted before a mapping kept below takes the place of its output)
    const memories = logicMemories(out);
    // (measured: the netlists measured, each { name, out, lines, cells, ns, luts, slices }, the candidates of the memories
    // as distributed RAM, #54)
    const pool = [];
    const offer = (name, o, lines, c, n, l, k) => { if (measured) pool.push({ name, out: o, lines, cells: c, ns: n, luts: l, slices: k }); };
    // the wide multiplexers onto MUXF5 … MUXF7 (#511), when the usual run counted some: kept by DEPTH_RULE, then
    // the usual mapping for the rest (the other mappings are made from the same netlist and measured against it)
    const trees = muxTrees(out);
    if (trees && out[PREMAP_FILE]) {
      const linesM = [];
      try {
        const outM = await run(['-q', '-p', `${muxfRemapCommands(top, family)}; ${outputs(top)}`], { [PREMAP_FILE]: asText(out[PREMAP_FILE]), [MUXF_MAP_FILE]: MUXF_MAP },
          l => { if (!quiet(l)) linesM.push(l); });
        const j0 = out[`${top}.json`], jM = outM[`${top}.json`];
        if (jM) {
          const ns = [criticalDelay(j0, top), criticalDelay(jM, top)], luts = [utilization(cellCounts(j0, top)).luts, utilization(cellCounts(jM, top)).luts];
          const sl = [slices(j0), slices(jM)];
          info.muxf = { trees, ns: ns[1], luts: luts[1], slices: sl[1], kept: keepDepth(ns, luts, DEPTH_RULE, sl) };
          if (info.muxf.kept) {
            out = { ...outM, [PREMAP_FILE]: out[PREMAP_FILE] };
            for (const l of linesM) sayNew(l);
          }
        }
      } catch (e) {
        // (an optional mapping that failed: the usual one kept, as the depth-oriented ones, #401)
        info.muxf = { trees, kept: false, failed: e.message };
        sayNew(`Warning: the mapping of the wide multiplexers failed (${e.message}): the usual mapping is kept`);
      }
    }
    const json = out[`${top}.json`];
    let chosen = out, cells = cellCounts(json, top);
    // a mapping of the design as it was before the LUT mapping, by an ABC script (null: ABC's own, onto LUT4_COSTS)
    // (delays: the script inline with the LUT library, #78)
    const remap = (script, lines, delays = false, luts = LUT4_COSTS) => run(['-q', '-p', `${remapCommands(top, family, delays ? { inline: script, luts } : { script: !!script, luts })}; ${outputs(top)}`],
      { [PREMAP_FILE]: asText(out[PREMAP_FILE]), [LUT6_MAP_FILE]: LUT6_MAP, ...(script && !delays && { [DEPTH_ABC_FILE]: script }), ...(delays && { [LUT_LIB_FILE]: LUT_LIB }) },
      l => { if (!quiet(l)) lines.push(l); });
    // Normal, a design that gets none of High's mappings (#54): the mapping with the wider functions too (LUT4_COSTS,
    // ABC's own script, the 6-input functions split by LUT6_MAP), kept when better by DEPTH_RULE, as at High (the EPFL
    // barrel shifter's 4:1 multiplexers: two LUT4s and a MUXF5 each); started at once beside the others (not after the wide
    // multiplexers kept, as the critical path's remaps)
    const linesW = [];
    const wideN = wide && normal && !tryDepth() && depth && !info.muxf?.kept && !info.muxf?.failed && out[PREMAP_FILE] && utilization(cells).luts <= DEPTH_RULE.maxLuts ? remap(null, linesW) : null;
    wideN?.catch(() => {});
    // the GIA's SOP balancing (#654): a deep design's candidate (SOPB_RULE), at both efforts and above DEPTH_RULE.maxLuts
    // too, started at once beside the other mappings
    const linesS = [];
    const sopb = depth && out[PREMAP_FILE] && utilization(cells).luts <= SOPB_RULE.maxLuts && logicLevels(json, top) > SOPB_RULE.levels
      ? remap(DEPTH_SOPB, linesS) : null;
    sopb?.catch(() => {});
    if (tryDepth() && out[PREMAP_FILE] && utilization(cells).luts <= DEPTH_RULE.maxLuts) {
      // (the kept mappings' warnings: said once the choice is made, none of a mapping a failure drops)
      const kept = [];
      try {
        // the mapping with the wider functions too (LUT4_COSTS, ABC's own script), kept when better than
        // the one onto LUT4s alone by DEPTH_RULE; the depth-oriented one is then measured against it
        // (the two from the same netlist, at once: in parallel when run() has several Yosys, #86)
        let base = json;
        const linesW = [], lines2 = [], lines3 = [], lines4 = [];
        const first = Promise.all([remap(null, linesW), remap(DEPTH_ABC, lines2)]);
        // ABC9 onto LUT4s alone (#377), from the same netlist, measured against the netlist chosen of the others:
        // with 4 Yosys or more at a time started now, before the second balancing (its run, about 2.5 times a
        // remap's, the longest: last in the queue it would make the synthesis longest), else after them (each
        // more Yosys costs memory in the browser)
        const lines9 = [], lines5 = [];
        const abc9 = () => run(['-q', '-p', `${abc9RemapCommands(top, family)}; ${outputs(top)}`], { [PREMAP_FILE]: asText(out[PREMAP_FILE]), [SRL_CELLS_FILE]: SRL_CELLS },
          l => { if (!quiet(l)) lines9.push(l); });
        const early9 = withAbc9 && (run.parallel || 1) >= 4 ? abc9() : null;
        early9?.catch(() => {});
        // the second balancing (below) from the same netlist: with 4 Yosys or more at a time started now,
        // after the first ones, only its choice waiting for them (#277); with fewer, only when it is needed
        const lines6 = [];
        const second = () => Promise.all([remap(DEPTH_ABC2, lines3), remap(DEPTH_ABC2, lines4, true), remap(DEPTH_ABC3, lines5, true), remap(DEPTH_ABC2_LUT4, lines6, false, LUT4_ONLY)]);
        const early = (run.parallel || 1) >= 4 ? second() : null;
        early?.catch(() => {});
        const [outW, out2] = await first;
        offer('usual', chosen, [], cells, criticalDelay(json, top), utilization(cells).luts, slices(json));
        const jsonW = outW[`${top}.json`];
        if (jsonW) {
          const cellsW = cellCounts(jsonW, top);
          const nsW = [criticalDelay(json, top), criticalDelay(jsonW, top)], lutsW = [utilization(cells).luts, utilization(cellsW).luts];
          const slW = [slices(json), slices(jsonW)];
          info.wide = { ns: nsW[1], luts: lutsW[1], slices: slW[1], kept: keepDepth(nsW, lutsW, DEPTH_RULE, slW) };
          offer('wide', outW, linesW, cellsW, nsW[1], lutsW[1], slW[1]);
          if (info.wide.kept) {
            chosen = outW;
            cells = cellsW;
            base = jsonW;
            for (const l of linesW) kept.push(l);
          }
        }
        const json2 = out2[`${top}.json`];
        if (json2) {
          const cells2 = cellCounts(json2, top);
          const ns = [criticalDelay(base, top), criticalDelay(json2, top)], luts = [utilization(cells).luts, utilization(cells2).luts];
          const sl = [slices(base), slices(json2)];
          // (against the mapping onto LUT4s alone; or, faster than it, against the one with the wider
          // functions, as before #54: the LUT4s alone smaller, a design limited by its depth would keep them)
          const kept = info.wide && !info.wide.kept ? keepSecond([info.wide.ns, ...ns], [info.wide.luts, ...luts], DEPTH_RULE, [info.wide.slices, ...sl])
            : keepDepth(ns, luts, DEPTH_RULE, sl);
          Object.assign(info, { tried: true, kept, ns, luts, slices: sl });
          offer('depth', out2, lines2, cells2, ns[1], luts[1], sl[1]);
          if (info.kept) {
            chosen = out2;
            cells = cells2;
            for (const l of lines2) kept.push(l);
            // balanced once more (DEPTH_ABC2), with and without the LUT delays (#78), twice more with them
            // (DEPTH_ABC3, #52), and once more onto LUT4s alone (#370), at once; each kept by keepSecond, a later one in
            // place of an earlier one when both are and it is better by DEPTH_RULE
            const [out3, out4, out5, out6] = await (early || second());
            const cand = (o, lines, name) => {
              const j = o[`${top}.json`];
              if (!j) return null;
              const c = cellCounts(j, top), n = criticalDelay(j, top), l = utilization(c).luts, k = slices(j);
              offer(name, o, lines, c, n, l, k);
              return { out: o, lines, cells: c, ns: n, luts: l, slices: k, kept: keepSecond([...ns, n], [...luts, l], DEPTH_RULE, [...sl, k]) };
            };
            const a = cand(out3, lines3, 'second'), b = cand(out4, lines4, 'delays'), c = cand(out5, lines5, 'third'), d = cand(out6, lines6, 'lut4');
            const best = [a, b, c, d].reduce((x, y) => (y?.kept && (!x || keepDepth([x.ns, y.ns], [x.luts, y.luts], DEPTH_RULE, [x.slices, y.slices])) ? y : x), null);
            if (a) info.second = { ns: a.ns, luts: a.luts, slices: a.slices, kept: best === a };
            if (b) info.delays = { ns: b.ns, luts: b.luts, slices: b.slices, kept: best === b };
            if (c) info.third = { ns: c.ns, luts: c.luts, slices: c.slices, kept: best === c };
            if (d) info.lut4 = { ns: d.ns, luts: d.luts, slices: d.slices, kept: best === d };
            if (best) {
              chosen = best.out;
              cells = best.cells;
              for (const l of best.lines) kept.push(l);
            }
          }
        }
        // ABC9's netlist kept when better than the one chosen by DEPTH_RULE (keepDepth, with the slices: #377)
        const out9 = withAbc9 ? await (early9 || abc9()) : {};
        const json9 = out9[`${top}.json`];
        if (json9) {
          const cells9 = cellCounts(json9, top);
          const ns9 = [criticalDelay(chosen[`${top}.json`], top), criticalDelay(json9, top)], luts9 = [utilization(cells).luts, utilization(cells9).luts];
          const sl9 = [slices(chosen[`${top}.json`]), slices(json9)];
          info.abc9 = { ns: ns9[1], luts: luts9[1], slices: sl9[1], kept: keepDepth(ns9, luts9, DEPTH_RULE, sl9) };
          offer('abc9', out9, lines9, cells9, ns9[1], luts9[1], sl9[1]);
          if (info.abc9.kept) {
            chosen = out9;
            cells = cells9;
            kept.length = 0;
            for (const l of lines9) kept.push(l);
          }
        }
        for (const l of kept) sayNew(l);
      } catch (e) {
        // an optional mapping that failed (Yosys crashed; in the browser, out of memory once more): the
        // first mapping's netlist, valid, is kept and said (#401)
        chosen = out;
        cells = cellCounts(json, top);
        for (const k of ['wide', 'second', 'delays', 'third', 'lut4', 'abc9']) delete info[k];
        Object.assign(info, { tried: false, kept: false, ns: null, luts: null, slices: null, failed: e.message });
        sayNew(`Warning: the depth-oriented mapping failed (${e.message}): the usual mapping is kept`);
      }
    }
    // the SOP-balanced netlist kept when better than the one chosen by DEPTH_RULE (at Normal, a design that gets none of
    // High's mappings, too large for them: only when DEEP_RULE.gain faster, as High's mappings at Normal, #611)
    if (sopb) {
      try {
        const outS = await sopb, jS = outS[`${top}.json`];
        if (jS) {
          const j0 = chosen[`${top}.json`], cellsS = cellCounts(jS, top);
          const ns = [criticalDelay(j0, top), criticalDelay(jS, top)], luts = [utilization(cells).luts, utilization(cellsS).luts], sl = [slices(j0), slices(jS)];
          const kept = keepDepth(ns, luts, DEPTH_RULE, sl) && (!normal || tryDepth() || ns[1] <= ns[0] * (1 - deepRule.gain));
          info.sopb = { ns: ns[1], luts: luts[1], slices: sl[1], kept };
          if (kept) {
            chosen = outS;
            cells = cellsS;
            for (const l of linesS) sayNew(l);
          }
        }
      } catch (e) {
        info.sopb = { kept: false, failed: e.message };
        sayNew(`Warning: the mapping balanced as sums of products failed (${e.message}): the netlist chosen before is kept`);
      }
    }
    // the critical path mapped again for speed (#652), then the clock enables that end it folded into the D logic
    // (#653): each a candidate from the netlist before the LUT mapping, measured against the netlist chosen of the
    // others and kept by DEPTH_RULE (before them, the depth-oriented ones were measured against it: the EPFL max
    // 18 % slower)
    // (not after an optional mapping that failed: in the browser, out of memory once more, #401)
    if (speed && !info.muxf?.kept && !info.muxf?.failed && !info.failed && !info.sopb?.failed && out[PREMAP_FILE] && utilization(cells).luts <= SPEED_RULE.maxLuts) {
      const lutsOf = j => utilization(cellCounts(j, top)).luts;
      const better = (a, b) => keepDepth([criticalDelay(a, top), criticalDelay(b, top)], [lutsOf(a), lutsOf(b)], DEPTH_RULE, [slices(a), slices(b)]);
      const premap = asText(out[PREMAP_FILE]);
      let script = null, base = chosen;
      try {
        const linesS = [];
        const outS = await run(['-q', '-p', `${speedRemapCommands(top, family)}; ${outputs(top)}`], { [PREMAP_FILE]: premap }, l => { if (!quiet(l)) linesS.push(l); });
        const jS = outS[`${top}.json`];
        if (jS) {
          info.speed = { ns: criticalDelay(jS, top), luts: lutsOf(jS), slices: slices(jS), kept: better(base[`${top}.json`], jS) };
          if (info.speed.kept) {
            base = outS;
            script = SPEED_ABC;
          }
        }
        const ffs = criticalEnables(base[`${top}.json`], top, SPEED_RULE.margin);
        const linesF = [];
        const outF = ffs.length ? await run(['-q', '-p', `${foldRemapCommands(top, family, { script })}; ${outputs(top)}`],
          { [PREMAP_FILE]: premap, [FOLD_CE_MAP_FILE]: FOLD_CE_MAP, [FOLD_CE_FILE]: ffs.map(c => `${top}/${c}\n`).join('') }, l => { if (!quiet(l)) linesF.push(l); }) : {};
        const jF = outF[`${top}.json`];
        if (jF) {
          info.fold = { flipFlops: ffs.length, ns: criticalDelay(jF, top), luts: lutsOf(jF), slices: slices(jF), kept: better(base[`${top}.json`], jF) };
          if (info.fold.kept) base = outF;
        }
        if (base !== chosen) {
          chosen = base;
          cells = cellCounts(chosen[`${top}.json`], top);
          for (const l of [...(info.speed?.kept ? linesS : []), ...(info.fold?.kept ? linesF : [])]) sayNew(l);
        }
      } catch (e) {
        // (optional mappings that failed: the netlist chosen before them kept, as the others, #401)
        for (const k of ['speed', 'fold']) delete info[k];
        info.speedFailed = e.message;
        sayNew(`Warning: the critical path's remapping failed (${e.message}): the netlist chosen before it is kept`);
      }
    }
    // (Normal: the wider mapping measured against the netlist chosen of the others, the critical path's remaps included:
    // measured before them, it kept them out where they were faster, itc99-b08 11 % slower)
    if (wideN) {
      try {
        const outW = await wideN, jW = outW[`${top}.json`];
        if (jW) {
          const cellsW = cellCounts(jW, top);
          const j0 = chosen[`${top}.json`];
          const ns = [criticalDelay(j0, top), criticalDelay(jW, top)], luts = [utilization(cells).luts, utilization(cellsW).luts], sl = [slices(j0), slices(jW)];
          info.wide = { ns: ns[1], luts: luts[1], slices: sl[1], kept: keepDepth(ns, luts, DEPTH_RULE, sl) };
          if (info.wide.kept) {
            chosen = outW;
            cells = cellsW;
            for (const l of linesW) sayNew(l);
          }
        }
      } catch (e) {
        info.wide = { kept: false, failed: e.message };
        sayNew(`Warning: the mapping with the wider functions failed (${e.message}): the netlist chosen before is kept`);
      }
    }
    // the chosen netlist's critical LUTs made one level shallower (#652, core/synth-open-resynth.js)
    ({ chosen, cells } = await resynthStage({ run, speed, top, withResynth }, { chosen, cells, info, slices, sayNew }));
    return { chosen, cells, info, ns: criticalDelay(chosen[`${top}.json`], top), slices: () => slices(chosen[`${top}.json`]), memories, pool };
  }

  return { withDepth };
}
