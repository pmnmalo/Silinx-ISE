// Silinx - the Spartan-6 router's routed design (#730, core/fpga/s6/route.js routedXdlS6): each net's PIPs, a
// power net split into one net per TIEOFF it is routed from (GLOBAL_LOGIC1_0 …), the TIEOFFs and the sites of the
// route-throughs declared as XDL_DUMMY instances (xdl -xdl2ncd rejects an outpin of an undeclared one), as ISE
// writes them; a route-through out of a net's own source site as that instance's _ROUTETHROUGH setting.
import { PIP_ROUTETHRU } from '../device.js';
import { routeThruSite } from './route-nets.js';

/** The routed design of routedXdlS6. */
export function mountRoutedS6(ctx) {
  const { design, device, r, res } = ctx;
  const { E, fromOf } = r;
  const dummies = new Map();   // name -> inst
  const extraCfg = new Map();  // inst name -> [cfg items]
  const instAt = new Map(design.insts.filter(i => i.placed).map(i => [i.site, i]));
  const dummy = (site, type, cfg) => {
    const s = device.site(site);
    const name = `XDL_DUMMY_${s.tileName}_${site}`;
    const d = dummies.get(name) || { name, type, placed: true, tile: s.tileName, site, cfg: [{ attr: '_NO_USER_LOGIC', name: '', value: '' }] };
    for (const c of cfg) if (!d.cfg.some(x => x.attr === c.attr && x.name === c.name && x.value === c.value)) d.cfg.push(c);
    dummies.set(name, d);
    return name;
  };
  const pipOf = e => { const p = device.pip(E.edgeTile[e], E.edgePip[e]); return { tile: p.tile, from: p.from, dir: p.dir, to: p.to }; };
  // a route-through: its site's dummy instance, or the source instance's setting
  const routeThru = e => {
    if (!(E.edgeFlags[e] & PIP_ROUTETHRU)) return;
    const site = routeThruSite(device, res, E.edgeTile[e], E.edgePip[e]);
    const tp = device.templates[device.tileTemplate[E.edgeTile[e]]];
    const rt = res.rtPins[tp.rt[E.edgePip[e]]];
    const item = { attr: '_ROUTETHROUGH', name: rt.from, value: rt.to };
    const own = instAt.get(site);
    if (own) { const l = extraCfg.get(own.name) || []; if (!l.some(x => x.name === item.name)) l.push(item); extraCfg.set(own.name, l); } else dummy(site, rt.type, [item]);
  };

  const nets = [];
  const byNet = new Map(r.work.map((w, i) => [w.net, i]));
  for (const net of design.nets) {
    const wi = byNet.get(net);
    if (wi === undefined) { nets.push({ ...net, pips: [] }); continue; }
    const w = r.work[wi], tree = r.trees[wi];
    if (!w.power) {
      const pips = [];
      for (const e of tree.values()) if (e >= 0) { pips.push(pipOf(e)); routeThru(e); }
      nets.push({ ...net, pips });
      continue;
    }
    // a power net: one net a TIEOFF (the root of each part of its tree)
    const rootOf = new Map();
    const root = n => {
      if (rootOf.has(n)) return rootOf.get(n);
      const e = tree.get(n), x = e === undefined || e < 0 ? n : root(fromOf(e));
      rootOf.set(n, x);
      return x;
    };
    const parts = new Map();   // root node -> { pips, inpins }
    const part = n => { const k = root(n); if (!parts.has(k)) parts.set(k, { pips: [], inpins: [] }); return parts.get(k); };
    for (const [n, e] of tree) if (e >= 0) { part(n).pips.push(pipOf(e)); routeThru(e); }
    for (const s of w.sinks) if (tree.has(s.node)) part(s.node).inpins.push(s.pin);
    const pin = w.power === 'vcc' ? 'HARD1' : 'HARD0';
    let k = 0;
    for (const [n, p] of [...parts].sort((a, b) => a[0] - b[0])) {
      const t = w.tieoffOf.get(n);
      if (!t) continue;
      const inst = dummy(t.site, 'TIEOFF', [{ attr: w.power === 'vcc' ? '_VCC_SOURCE' : '_GND_SOURCE', name: '', value: pin }]);
      nets.push({ name: `${net.name}_${k++}`, type: net.type, outpins: [{ inst, pin }], inpins: p.inpins, pips: p.pips });
    }
    // (sinks not reached: kept on a net of no source, as the placed design had them)
    const left = w.sinks.filter(s => !tree.has(s.node)).map(s => s.pin);
    if (left.length) nets.push({ ...net, inpins: left, pips: [] });
  }
  const insts = design.insts.map(i => (extraCfg.has(i.name) ? { ...i, cfg: [...(i.cfg || []), ...extraCfg.get(i.name)], cfgRaw: undefined } : i));
  return { ...design, insts: [...insts, ...dummies.values()], nets };
}
