// #3, the irregular tiles: the joins of the clock network, tested by DRC on ISE's own clock nets (research/s3e-device
// README.md, step 4). A tile's GCLK line (a CLB's GCLKk…) stays ambiguous in the observations: its candidates are the
// clock wires of the net in other tiles, the spine's (every net of the line has them) and one or two of the GCLKH rows
// (gen-obsclk.mjs, intersectAmbiguous). A global line is one node across the chip, so the join tests of rounds 1-8 (a net
// from a source to one end, a PIP out of the other) would fit 8 to a design; here a test is ISE's routed net N of a
// BUFGMUX (a legal tree), kept to its spine and row tiles' PIPs (CLK…, GCLK…, the block-RAM columns' GCLKH tiles), without
// the PIP into the candidate c, with N's PIP out of the tested wire f: DRC finds an island exactly when f is driven
// through c (`drc -z`: islands are named per net). The other row wires' PIPs lead nowhere (antennas, expected). A control
// keeps the PIP into c: no island. The nets of one design share no wire.
//   [MAXROW=2] [LIMIT=n] node clocktests.mjs tests obs.json dir routed.xdl…   dir/j<k>.xdl, dir/tests.json (run:
//                                                           ise-remote.sh -f dir); MAXROW: only the wires with at most
//                                                           that many row candidates; LIMIT: the first n wires;
//                                                           PICK=dir,…: the wires those tests did not settle, each
//                                                           with the one candidate a rule of their joins matches
//                                                           (joinRule: the same wires at the same offset)
//   node clocktests.mjs verdicts dir                        dir/verdicts.json: [c, f, 'join' | 'no-join' | 'control' …]
import fs from 'node:fs';
import path from 'node:path';
import { parseXdl } from '../../core/xdl.js';
import { wireFamily, joinRule } from './observe.mjs';
import { parseJoinTests } from './hypotheses.mjs';
import { fileURLToPath } from 'node:url';

const PART = process.env.PART || 'xc3s250ecp132-4';
const typeOf = tile => tile.replace(/_X\d+Y\d+$/, '');
/** A tile of the clock network's spine or rows: its PIPs kept in a test. */
export const clockTile = tile => /^(CLK[TBLRCHV]|GCLK|BRAM\d?_(UP|DN)_GCLKH|BRAMSITE2_(UP|DN)_GCLKH)/.test(typeOf(tile));
/** A row tile (a GCLKH): the candidates tested. */
export const rowTile = tile => /GCLKH/.test(typeOf(tile));

const key = (t, w) => `${t}/${w}`;

/** The clock nets of a routed design: [{ src: inst, pips, ends: Set to-wire keys, dangling: Map from-key -> pip }]. */
export function clockNets(design) {
  const bufg = new Map(design.insts.filter(i => i.type === 'BUFGMUX').map(i => [i.name, i]));
  const out = [];
  for (const net of design.nets) {
    const o = net.outpins.length === 1 && bufg.get(net.outpins[0].inst);
    if (!o) continue;
    const tos = new Set(net.pips.map(p => key(p.tile, p.to)));
    const dangling = new Map();
    for (const p of net.pips) if (!tos.has(key(p.tile, p.from)) && wireFamily(p.from) === 'gclk' && !dangling.has(key(p.tile, p.from))) dangling.set(key(p.tile, p.from), p);
    out.push({ src: o, pin: net.outpins[0].pin, pips: net.pips, tos, dangling });
  }
  return out;
}

/** The test nets for hypotheses [[c, f]] over the clock nets of the designs: { designs: [{ xdl, tests: [{ net, join,
 *  control }] }], untestable: [[c, f]] }. control: every n-th test also run with the PIP into c kept. */
export function clockTestDesigns(hyps, designs, { controlEvery = 10 } = {}) {
  const nets = designs.flatMap(d => clockNets(d).map(n => ({ ...n, design: d })));
  const tests = [], untestable = [], bases = new Set();
  hyps.forEach(([c, f], i) => {
    const n = nets.find(x => x.dangling.has(f) && x.tos.has(c));
    if (!n) { untestable.push([c, f]); return; }
    const into = n.pips.filter(p => key(p.tile, p.to) === c);
    const base = { src: n.src, pin: n.pin, join: [c, f], fpip: n.dangling.get(f) };
    if (rowTile(c.split('/')[0])) {
      const keep = n.pips.filter(p => clockTile(p.tile) && !into.includes(p));
      tests.push({ ...base, pips: [...keep, base.fpip], control: false });
      if (i % controlEvery === 0) tests.push({ ...base, pips: [...keep, ...into, base.fpip], control: true });
      return;
    }
    // (a spine candidate: the spine's PIPs only, the rows' left out, since every row below c would be cut off; and a
    // baseline, the same without f's PIP, once for each net and candidate: the test means something only when it is
    // clean, nothing of the spine below c)
    const keep = n.pips.filter(p => clockTile(p.tile) && !rowTile(p.tile) && !into.includes(p));
    const b = `${nets.indexOf(n)}|${c}`;
    if (!bases.has(b)) { bases.add(b); tests.push({ ...base, pips: keep, baseline: b, control: false }); }
    tests.push({ ...base, pips: [...keep, base.fpip], base: b, control: false });
  });
  // packed: no two nets of a design share a wire or a buffer
  const out = [];
  for (const t of tests) {
    const wires = new Set(t.pips.flatMap(p => [key(p.tile, p.from), key(p.tile, p.to)]));
    let d = out.find(x => !x.bufs.has(t.src.site) && [...wires].every(w => !x.wires.has(w)));
    if (!d) out.push(d = { bufs: new Set(), wires: new Set(), tests: [] });
    d.bufs.add(t.src.site); wires.forEach(w => d.wires.add(w)); d.tests.push(t);
  }
  return {
    designs: out.map(d => {
      const insts = d.tests.map((t, k) => `inst "b${k}" "BUFGMUX",placed ${t.src.tile} ${t.src.site} ,\n  cfg "${t.src.cfg.map(c => `${c.attr}:${c.name || ''}:${c.value}`).join(' ')}" ;`);
      const nets = d.tests.map((t, k) => `net "t${k}" ,\n  outpin "b${k}" ${t.pin} ,\n${t.pips.map(p => `  pip ${p.tile} ${p.from} ${p.dir} ${p.to} ,`).join('\n')}\n  ;`);
      return { xdl: `design "clocks" ${PART} v3.2 ;\n${insts.join('\n')}\n${nets.join('\n')}\n`, tests: d.tests.map((t, k) => ({ net: `t${k}`, join: t.join, control: t.control, ...(t.baseline ? { baseline: t.baseline } : {}), ...(t.base ? { base: t.base } : {}) })) };
    }),
    untestable,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'tests') {
    const [obsFile, dir, ...files] = args;
    const obs = JSON.parse(fs.readFileSync(obsFile, 'utf8'));
    // the hypotheses: each ambiguous clock wire (not of a net's source tile) with each candidate of a row tile
    const maxRow = +(process.env.MAXROW ?? Infinity), limit = +(process.env.LIMIT ?? Infinity);
    let amb = obs.ambiguous.filter(a => !a.src && wireFamily(a.from.split('/')[1]) === 'gclk')
      .map(a => ({ from: a.from, candidates: a.candidates.filter(c => rowTile(c.split('/')[0])) })).filter(a => a.candidates.length);
    if (process.env.PICK) {
      const v = process.env.PICK.split(',').flatMap(d => JSON.parse(fs.readFileSync(path.join(d, 'verdicts.json'), 'utf8')));
      const done = new Set(v.filter(x => x[2] === 'join' || x[2] === 'no-join').map(x => x[1]));
      const rules = new Set(v.filter(x => x[2] === 'join').map(([c, f]) => joinRule(c, f)));
      amb = amb.filter(a => !done.has(a.from)).map(a => ({ from: a.from, candidates: a.candidates.filter(c => rules.has(joinRule(c, a.from))) })).filter(a => a.candidates.length === 1);
    }
    // (SPINE=1: the wires with no row candidate, against their spine candidates; NEAR=1: each wire's candidates in its own
    // column, a row's, or its own row, the spine's, first: where every join (A) and (B) found is)
    if (process.env.SPINE === '1') {
      amb = obs.ambiguous.filter(a => !a.src && wireFamily(a.from.split('/')[1]) === 'gclk' && !a.candidates.some(c => rowTile(c.split('/')[0])));
    }
    if (process.env.SKIP) {
      const v = process.env.SKIP.split(',').flatMap(d => JSON.parse(fs.readFileSync(path.join(d, 'verdicts.json'), 'utf8')));
      const done = new Set(v.filter(x => x[2] === 'join').map(x => x[1]));
      const tried = new Set(v.filter(x => x[2] === 'join' || x[2] === 'no-join').map(x => `${x[0]}|${x[1]}`));
      amb = amb.filter(a => !done.has(a.from)).map(a => ({ ...a, candidates: a.candidates.filter(c => !tried.has(`${c}|${a.from}`)) }));
    }
    if (process.env.NEAR === '1') {
      const xy = k => k.split('/')[0].match(/X(\d+)Y(\d+)$/).slice(1).map(Number);
      amb = amb.map(a => ({ ...a, candidates: a.candidates.filter(c => (rowTile(c.split('/')[0]) ? xy(c)[0] === xy(a.from)[0] : xy(c)[1] === xy(a.from)[1])) }));
    }
    const hyps = amb.map(a => a.candidates.map(c => [c, a.from])).filter(h => h.length && h.length <= maxRow).slice(0, limit).flat();
    const r = clockTestDesigns(hyps, files.map(f => parseXdl(fs.readFileSync(f, 'utf8'))));
    fs.mkdirSync(dir, { recursive: true });
    r.designs.forEach((d, i) => fs.writeFileSync(path.join(dir, `j${i}.xdl`), d.xdl));
    fs.writeFileSync(path.join(dir, 'tests.json'), JSON.stringify({ designs: r.designs.map(d => d.tests), untestable: r.untestable }));
    console.log(`${hyps.length} hypotheses: ${r.designs.length} designs, ${r.designs.reduce((n, d) => n + d.tests.length, 0)} tests (controls among them), ${r.untestable.length} with no net of both`);
  } else if (cmd === 'verdicts') {
    const [dir] = args;
    const t = JSON.parse(fs.readFileSync(path.join(dir, 'tests.json'), 'utf8'));
    const out = [], count = {}, base = new Map();
    const result = t.designs.map((tests, i) => {
      const f = path.join(dir, `j${i}.drc.log`);
      const log = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      return /PhysDesignRules results/.test(log) ? parseJoinTests(log, tests.map(x => x.net)) : null;
    });
    t.designs.forEach((tests, i) => { for (const x of tests) if (x.baseline) base.set(x.baseline, !result[i] ? 'not-run' : result[i].get(x.net)); });
    t.designs.forEach((tests, i) => {
      const v = result[i];
      for (const x of tests) {
        if (x.baseline) { const r = `baseline-${base.get(x.baseline) === 'join' ? 'clean' : base.get(x.baseline)}`; count[r] = (count[r] || 0) + 1; out.push([...x.join, r]); continue; }
        // (a test against a baseline that is not clean says nothing)
        if (x.base && base.get(x.base) !== 'join') { count['base-not-clean'] = (count['base-not-clean'] || 0) + 1; out.push([...x.join, 'base-not-clean']); continue; }
        // (an island: f driven through c, a join; none: not; a control: no island expected)
        const r = !v ? 'not-run' : v.get(x.net) === 'unclear' ? 'unclear' : x.control ? (v.get(x.net) === 'join' ? 'control' : 'control-island') : v.get(x.net) === 'no-join' ? 'join' : 'no-join';
        count[r] = (count[r] || 0) + 1;
        out.push([...x.join, r]);
      }
    });
    fs.writeFileSync(path.join(dir, 'verdicts.json'), JSON.stringify(out));
    console.log(dir, JSON.stringify(count));
  }
}
