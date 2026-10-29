// Silinx - the legality of a routed Spartan-6 design (#730) against the routing graph, on its own (browser + Node):
// the rules of every routing (core/fpga/route.js checkRouting: every PIP the device's, every sink reached from its
// source, no PIP hanging off the tree, no node of two nets) and the Spartan-6's: a global clock on the global
// network only, a route-through only through a site the design declares for it (an XDL_DUMMY instance of that
// route-through, or the net's own source by its carry out to DMUX), one net through each such site, a power net from a TIEOFF or a slice's
// LUT set as its constant.
//
//   checkRoutingS6(routed, device) -> { ok, problems: [strings] }
import { checkRouting } from '../route.js';
import { PIP_ROUTETHRU } from '../device.js';
import { routingResources, routeThruSite } from './route-nets.js';

/** The rules above on a routed design (parseXdl's structure, routedXdlS6's). */
export function checkRoutingS6(routed, device) {
  const res = routingResources(device);
  const problems = [...checkRouting(routed, device).problems];
  const inst = new Map(routed.insts.map(i => [i.name, i]));
  const atSite = new Map(routed.insts.filter(i => i.placed).map(i => [i.site, i]));
  const rtNet = new Map();   // route-through site -> net
  for (const net of routed.nets) {
    const src = net.outpins[0] && inst.get(net.outpins[0].inst);
    const clock = src && (src.type === 'BUFG' || src.type === 'BUFGMUX');
    // (a power net from a TIEOFF, or from a slice's position set as the constant: _GND_SOURCE::C)
    const attr = net.type === 'vcc' ? '_VCC_SOURCE' : '_GND_SOURCE';
    if ((net.type === 'vcc' || net.type === 'gnd') && net.inpins.length && src?.type !== 'TIEOFF' && !(src?.cfg || []).some(c => c.attr === attr && c.value === net.outpins[0].pin)) {
      problems.push(`net ${net.name}: a power net not from a TIEOFF nor a slice's constant`);
    }
    for (const p of net.pips) {
      const k = device.tile(p.tile), i = k === undefined ? -1 : device.findPip(k, p.from, p.to);
      if (i < 0) continue;   // (checkRouting's)
      const [, to] = device.pipNodes(k, i);
      if (clock && res.general[to] && !net.inpins.some(q => device.sitePinNode(inst.get(q.inst)?.site, q.pin) === to)) {
        problems.push(`net ${net.name}: the global clock on the general interconnect (${device.nodeName(to)})`);
      }
      if (!(device.templates[device.tileTemplate[k]].flags[i] & PIP_ROUTETHRU)) continue;
      const site = routeThruSite(device, res, k, i);
      const owner = site && atSite.get(site);
      const rt = res.rtPins[device.templates[device.tileTemplate[k]].rt[i]];
      if (!owner) { problems.push(`net ${net.name}: a route-through of ${site ?? p.tile} no instance declares`); continue; }
      // (out of its own slice: the carry out to DMUX only, never through a LUT, PhysDesignRules:2066)
      if (owner === src && /^SLICE/.test(owner.type) && !(rt.from === 'COUT' && rt.to === 'DMUX')) {
        problems.push(`net ${net.name}: through its own slice ${site} by ${rt.from} -> ${rt.to}, a second input of a LUT in use`);
      }
      if (owner !== src && !(owner.cfg || []).some(c => c.attr === '_ROUTETHROUGH' && c.name === rt.from && c.value === rt.to)) {
        problems.push(`net ${net.name}: through ${site} (${owner.name}), which is not configured for it (${rt.from} -> ${rt.to})`);
      }
      if (owner !== src) {
        if (rtNet.has(site) && rtNet.get(site) !== net.name) problems.push(`${site}: the route-throughs of ${rtNet.get(site)} and ${net.name}`);
        rtNet.set(site, net.name);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}
