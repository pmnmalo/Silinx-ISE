// Silinx - device measurements: testing joins with ISE's design rule check
// (research/s3e-device/README.md).
//
// A join hypothesis "wire A of tile T and wire B of tile U are one node" is tested by one net:
// from a slice output of T, through PIPs of T to A, then one PIP of U out of B (to any wire C).
// If A and B are one node, the net is one tree: ISE's DRC finds an antenna (C leads nowhere) and
// an unrouted sink, both expected. If they are not, the PIP out of B is cut off from the net, and
// the DRC also says "The network <name> has island(s)". One design holds thousands of such nets,
// each with its own source, its own wires and its own nodes, so one run of xdl -xdl2ncd -force and
// drc tests thousands of joins.
//
// A tile with no slice (an I/O or block-RAM switch box, a tile at the edge) is driven from a slice of
// a neighbouring CLB: the path crosses joins already known (observed in ISE's routes or confirmed by
// earlier tests), e.g. slice -> OMUX -> E2BEG of the CLB, joined to E2END of the I/O tile, -> the
// tested wire. A wire only a site of the I/O or block-RAM tile drives (its OMUX, the hexes that begin
// there) is driven from that site: an IOB's input I, a block RAM's data output (`sourcesOf`, #3).

const splitKey = k => { const i = k.indexOf('/'); return [k.slice(0, i), k.slice(i + 1)]; };

/** The outputs of a slice used as test sources, and the input each net ends on (unrouted). */
export const SOURCES = [['X', 'F1'], ['Y', 'G1']];

/**
 * Test designs for joins. opts:
 *   part, joins: [['TILE/WIRE', 'TILE/WIRE']],
 *   slicesOf(tile) -> [{ site, pos }] (the slices of a tile that can drive a test, pos 0-3),
 *   pinWire(pos, pin) -> the tile wire of a slice pin,
 *   pipsOf(tile) -> [[from, to]] (the PIPs known to exist in the tile, wire names),
 *   nodeOf(key) -> [keys] (the wires predicted to be one node with 'TILE/WIRE': reserved with it),
 *   joined(key) -> [keys] (the wires of other tiles known to be joined to 'TILE/WIRE': observed or
 *     confirmed; a path may cross them, to reach a tile with no slice from a neighbouring one),
 *   maxDepth (PIPs from the slice output to the tested wire, default 3),
 *   maxJoins (known joins a path may cross, default 0: the source in the tested wire's own tile),
 *   sourcesOf(tile) -> [{ site, type: 'IOB' | 'RAMB16', siteType, tile, o: output pin, wire: its tile wire }] (other sites
 *     that can drive a test: an IOB's input I, a block RAM's output; none by default).
 * Returns { designs: [{ xdl, tests: [{ net, join }] }], untestable: [join] }.
 */
export function joinTestDesigns(opts) {
  const { part, joins, slicesOf, pinWire, pipsOf, nodeOf = k => [k], joined = () => [], maxDepth = 3, maxJoins = 0, sourcesOf = () => [] } = opts;
  const cache = new Map();   // tile -> { out: Map from -> [to], into: Map to -> [from], src: Map wire -> [source] }
  const tileOf = tile => {
    if (!cache.has(tile)) {
      const out = new Map(), into = new Map(), src = new Map();
      for (const [f, t] of pipsOf(tile)) {
        if (!out.has(f)) out.set(f, []);
        out.get(f).push(t);
        if (!into.has(t)) into.set(t, []);
        into.get(t).push(f);
      }
      for (const s of slicesOf(tile)) for (const [o, i] of SOURCES) {
        const w = pinWire(s.pos, o);
        if (!src.has(w)) src.set(w, []);
        src.get(w).push({ s, o, i });
      }
      // (an IOB's or a block RAM's output: no sink of its own, the net's antenna is the test's)
      for (const x of sourcesOf(tile)) {
        if (!src.has(x.wire)) src.set(x.wire, []);
        src.get(x.wire).push({ s: { site: x.site, type: x.type, siteType: x.siteType, tile: x.tile }, o: x.o, i: null });
      }
      cache.set(tile, { out, into, src });
    }
    return cache.get(tile);
  };
  let left = joins.slice();
  const designs = [], untestable = [];
  while (left.length) {
    const used = new Set(), usedSrc = new Set();
    const tests = [], next = [];
    const reserve = keys => keys.forEach(k => nodeOf(k).forEach(x => used.add(x)));
    const free = k => nodeOf(k).every(x => !used.has(x));
    // breadth first backwards from the tested wire, over the PIPs into it and the known joins, to a
    // slice output (only through free wires and unused sources when `onlyFree`); never through
    // `avoid` (the other end's node: a path through it would join the two ends by itself).
    // Returns { src, keys (source to tested wire), pips: [[tile, from, to]] } or null.
    const search = (target, avoid, onlyFree) => {
      const after = new Map([[target, null]]);   // key -> [the key after it on the path, by a PIP?]
      let frontier = [{ k: target, pips: 0, joins: 0 }];
      while (frontier.length) {
        for (const { k } of frontier) {
          const [t, w] = splitKey(k);
          for (const src of tileOf(t).src.get(w) || []) {
            if (onlyFree && usedSrc.has(`${src.s.site}.${src.o}`)) continue;
            const keys = [k], pips = [];
            for (let x = k; after.get(x); x = after.get(x)[0]) {
              const [y, pip] = after.get(x);
              if (pip) pips.push([splitKey(x)[0], splitKey(x)[1], splitKey(y)[1]]);
              keys.push(y);
            }
            return { src, keys, pips };
          }
        }
        const nf = [];
        for (const { k, pips, joins: nj } of frontier) {
          const [t, w] = splitKey(k);
          const steps = [];
          if (pips < maxDepth) for (const f of tileOf(t).into.get(w) || []) steps.push([`${t}/${f}`, true]);
          if (nj < maxJoins) for (const j of joined(k)) steps.push([j, false]);
          for (const [p, pip] of steps) {
            if (after.has(p) || avoid.has(p) || (onlyFree && !free(p))) continue;
            after.set(p, [k, pip]);
            nf.push({ k: p, pips: pips + (pip ? 1 : 0), joins: nj + (pip ? 0 : 1) });
          }
        }
        frontier = nf;
      }
      return null;
    };
    for (const join of left) {
      let plan = null, possible = false;
      for (const [d, l] of [[join[0], join[1]], [join[1], join[0]]]) {
        const [tL, wL] = splitKey(l);
        const outs = tileOf(tL).out.get(wL);
        if (!outs) continue;
        const avoid = new Set(nodeOf(l));
        if (!search(d, avoid, false)) continue;
        possible = true;
        const path = search(d, avoid, true);
        if (!path) continue;
        const wC = outs.find(t => free(`${tL}/${t}`));
        if (!wC) continue;
        const keys = [...path.keys, l, `${tL}/${wC}`];
        if (!keys.every(free)) continue;
        plan = { src: path.src, pips: [...path.pips, [tL, wL, wC]], keys };
        break;
      }
      if (!plan) { (possible ? next : untestable).push(join); continue; }
      reserve(plan.keys);
      usedSrc.add(`${plan.src.s.site}.${plan.src.o}`);
      tests.push({ net: `h${tests.length}`, join, plan });
    }
    if (!tests.length) { untestable.push(...next); break; }
    designs.push({ xdl: testXdl(part, tests), tests: tests.map(t => ({ net: t.net, join: t.join })) });
    left = next;
  }
  return { designs, untestable };
}

// Only the LUTs of the outputs used are set: a LUT whose input is not connected is a DRC error,
// and xdl -xdl2ncd spends about 30 ms on each error it reports.
function testXdl(part, tests) {
  const lines = [`design "joins" ${part} v3.2 ;`];
  const sites = new Map(), types = new Map();
  const of = new Map();
  for (const t of tests) { const s = t.plan.src; if (!sites.has(s.s.site)) sites.set(s.s.site, new Set()); sites.get(s.s.site).add(s.o); types.set(s.s.site, s.s.type || 'SLICEL'); of.set(s.s.site, s.s); }
  for (const [site, outs] of sites) {
    const n = `s_${site}`;
    // an IOB, its input from the pad (LVCMOS25, no register, no delay); a block RAM, both ports 512 x 36
    // (an input-only pad is an IBUF site: the instance of the site's own type, in its own tile)
    const at = `${of.get(site).tile || 'TILE'} ${site}`;
    if (types.get(site) === 'IOB') { lines.push(`inst "${n}" "${of.get(site).siteType || 'IOB'}", placed ${at} ,`, `  cfg " IDELMUX::1 IMUX::1 IOATTRBOX::LVCMOS25 INBUF:${n}_ibuf: PAD:${n}_pad: " ;`); continue; }
    // (a global buffer: its output O, no input, #3's clock network)
    if (types.get(site) === 'BUFGMUX') { lines.push(`inst "${n}" "BUFGMUX", placed ${at} ,`, `  cfg " DISABLE_ATTR::LOW GCLK_BUFFER:${n}: " ;`); continue; }
    if (types.get(site) === 'RAMB16') { lines.push(`inst "${n}" "RAMB16", placed ${at} ,`, `  cfg " PORTA_ATTR::512X36 PORTB_ATTR::512X36 RAMB16:${n}.RAMB16: RAMB16A:${n}.A: RAMB16B:${n}.B: " ;`); continue; }
    const f = outs.has('X') ? ` F:${n}_f:#LUT:D=A1 FXMUX::F XUSED::0` : '';
    const g = outs.has('Y') ? ` G:${n}_g:#LUT:D=A1 GYMUX::G YUSED::0` : '';
    lines.push(`inst "${n}" "SLICEL", placed TILE ${site} ,`, `  cfg "${f}${g} " ;`);
  }
  for (const t of tests) {
    const { src, pips } = t.plan, n = `s_${src.s.site}`;
    lines.push(`net "${t.net}" ,`, `  outpin "${n}" ${src.o} ,`, ...(src.i ? [`  inpin "${n}" ${src.i} ,`] : []));
    for (const [tile, from, to] of pips) lines.push(`  pip ${tile} ${from} -> ${to} ,`);
    lines.push('  ;');
  }
  return lines.join('\n') + '\n';
}

/**
 * The verdicts of a test design from the DRC report (drc -z) or the log of xdl -xdl2ncd -force:
 * Map net -> 'join' (no island) | 'no-join' (island). A routing conflict (PhysDesignRules 1712 /
 * 1713: two test nets on one node, when the nodes predicted to keep them apart were incomplete)
 * does not change the verdict: an island is a PIP cut off from the net's own source, whoever drives
 * its wire (41 479 tests, 15 836 of them with a conflict: all agreed with the shipped graph).
 * Nets the report names for anything else are 'unclear'.
 */
export function parseJoinTests(log, nets) {
  const text = log.replace(/\n\s+/g, ' ');
  const island = new Set(), other = new Set();
  const expected = /^(has an antenna|is only partially routed|is not completely routed|has a routing conflict with)/;
  for (const m of text.matchAll(/network <([^>]+)> ([^.]*)/g)) {
    if (/^has island/.test(m[2])) island.add(m[1]);
    else if (!expected.test(m[2])) other.add(m[1]);
  }
  const out = new Map();
  for (const n of nets) out.set(n, other.has(n) ? 'unclear' : island.has(n) ? 'no-join' : 'join');
  return out;
}

const IOB_SITE = /^(IOB|IBUF|DIFF[MS]I?)$/;

/**
 * The test sources other than slices, for joinTestDesigns' sourcesOf (#3): Map tile -> [{ site, type, siteType, tile, o,
 * wire }], the IOBs' inputs (I) and the block RAMs' outputs (DOAk, DOBk) observed in ISE's routes (obs: prototype.mjs
 * observe). Round 8:
 *   sourceObs: the IOBs' inputs from that observation instead (a design of another package of the same die: an IOB's
 *     site is its package pin, and the XC3S250E's FT256 bonds the I/O tiles the CP132 leaves without a pad);
 *   device (a Device, with joins): an I/O tile of the joins with no input observed takes its unbonded IOB sites (bonded
 *     2: NOPADk, bonded in no package) as sources, an IBUF on each, the I pin's wire from an observed tile of the same
 *     type at the same site position, else Ik_PINWIRE for the tile's k-th IOB, the rule every observed one follows
 *     (throws if one does not; a wrong name would only make xdl -xdl2ncd refuse the design);
 *   bufg: the global buffers' outputs (O) too, the sources of the clock network's tests (#3, the measured description).
 */
export function testSources(obs, { sourceObs = null, device = null, joins = [], bufg = false } = {}) {
  const typed = o => { const t = new Map(o.sites.map(x => [x.site, x.type])); return o.pins.map(p => ({ ...p, ty: t.get(p.site) })); };
  const extra = new Map();
  const add = x => { if (!extra.has(x.tile)) extra.set(x.tile, []); extra.get(x.tile).push(x); };
  for (const p of [...typed(obs).filter(q => !sourceObs || !IOB_SITE.test(q.ty)), ...(sourceObs ? typed(sourceObs).filter(q => IOB_SITE.test(q.ty)) : [])]) {
    const kind = IOB_SITE.test(p.ty) ? 'IOB' : p.ty === 'RAMB16' ? 'RAMB16' : bufg && p.ty === 'BUFGMUX' ? 'BUFGMUX' : null;
    if (!kind || p.dir !== 'o' || (kind === 'IOB' && p.pin !== 'I') || (kind === 'RAMB16' && !/^DO[AB]\d+$/.test(p.pin)) || (kind === 'BUFGMUX' && p.pin !== 'O')) continue;
    add({ site: p.site, type: kind, siteType: p.ty, tile: p.tile, o: p.pin, wire: p.wire });
  }
  if (!device) return extra;
  const R = device;
  const sitesOf = t => {
    const k = R.tileIndex.get(t);
    if (k === undefined) return null;
    const tp = R.templates[R.tileTemplate[k]];
    return { type: tp.type, sites: R.tileSites[k].map(([name, b], i) => ({ name, bonded: b, type: tp.sites[i].type })) };
  };
  const byRule = (s, i) => `I${i - s.sites.findIndex(x => IOB_SITE.test(x.type))}_PINWIRE`;
  // (the observation in the device's own package: its site names are the device's)
  const wireAt = new Map();
  for (const p of typed(obs)) {
    if (!IOB_SITE.test(p.ty) || p.dir !== 'o' || p.pin !== 'I') continue;
    const s = sitesOf(p.tile), i = s ? s.sites.findIndex(x => x.name === p.site) : -1;
    if (i < 0) continue;
    if (byRule(s, i) !== p.wire) throw new Error(`testSources: ${p.tile} ${p.site}.I on ${p.wire}, not ${byRule(s, i)}`);
    wireAt.set(`${s.type}|${i}`, p.wire);
  }
  const ioTiles = new Set(joins.flat().map(k => k.slice(0, k.indexOf('/'))).filter(t => /IOIS|IBUFS/.test(t)));
  for (const t of ioTiles) {
    if (extra.has(t)) continue;
    const s = sitesOf(t);
    s?.sites.forEach((x, i) => {
      if (x.bonded === 2 && IOB_SITE.test(x.type)) add({ site: x.name, type: 'IOB', siteType: 'IBUF', tile: t, o: 'I', wire: wireAt.get(`${s.type}|${i}`) || byRule(s, i) });
    });
  }
  return extra;
}
