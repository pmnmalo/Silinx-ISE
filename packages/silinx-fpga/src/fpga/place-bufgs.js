// Silinx toolchain - the placer's global clock buffers (#405: out of place in core/fpga/place.js): each on a
// buffer its driver (a DCM's output, a clock pad) reaches through dedicated paths of known bits, whose lines reach
// its clock's loads; the two buffers of a pair only with their input lines shared as they must be (#846).
import { BUFG_ORDER, PlaceError } from './place.js';

/** nothing of place. */
export function mountBufgs(ctx) {
  const {
    bufgSites, dev, packed, bufClaimed, bufOwner, lineServes, objs, padReachOf, preBuf, sites, takeBuf, warnings
  } = ctx;

  // clock buffers: by the pad (or DCM) that drives them
  const bufUsed = new Set();
  const byName = new Map(dev.bufgmux.map(b => [b.name, b]));
  const driverOfPin = new Map();
  for (const n of packed.nets) for (const ip of n.inpins) driverOfPin.set(`${ip.inst}:${ip.pin}`, n.outpins[0]);
  // a buffer driven by a DCM output, or by a clock pad put on a GCLK pin: one of the buffers that
  // output reaches (bufgSites: the dedicated paths of known bits, route.js bufgReach), those first
  const reachOf = o => {
    const d = driverOfPin.get(`${o.inst}:I0`);
    // a clock pad, with or without a LOC: the buffers of its GCLK pin, if it is one (#58)
    if (d && bufgSites && packed.insts[d.inst].kind === 'iob') return new Set(padReachOf(sites[d.inst].name));
    return d && bufgSites && packed.insts[d.inst].kind === 'dcm' ? new Set(bufgSites(sites[d.inst].name, d.pin)) : null;
  };
  // (the most constrained first: a DCM output that reaches fewer buffers chooses before the others)
  const reachSize = o => reachOf(o)?.size || Infinity;
  // The two buffers of a pair (BUFGMUX_XxYy and XxY(y^1)) share their input lines (#846): the I1 of one is
  // the line of the other's I0. A clock switch (a BUFGMUX with I1) and a buffer on its partner only when
  // the partner's I0 is the switch's I1 (and the switch's I0 the partner's I1, if it switches too).
  const pairBuf = name => name.replace(/Y(\d+)$/, (_, y) => `Y${+y ^ 1}`);
  const inNet = (bi, pin) => { const d = driverOfPin.get(`${bi}:${pin}`); return d ? `${d.inst}:${d.pin}` : undefined; };
  const pairOk = (bi, name) => {
    const q = bufAt.get(pairBuf(name)) ?? bufOwner.get(pairBuf(name));
    if (q === undefined) return true;
    const sw = i => driverOfPin.has(`${i}:I1`);
    if (sw(bi) && inNet(q, 'I0') !== inNet(bi, 'I1')) return false;
    return !sw(q) || inNet(bi, 'I0') === inNet(q, 'I1');
  };
  const bufAt = new Map();   // buffer name -> the bufg inst placed on it
  // (the buffers matched to the DCMs' outputs above first)
  const bufgObjs = objs.filter(o => o.kind === 'bufg').sort((a, b) => (preBuf.has(b.inst) - preBuf.has(a.inst)) || reachSize(a) - reachSize(b));
  for (const o of bufgObjs) {
    if (preBuf.has(o.inst) && pairOk(o.inst, preBuf.get(o.inst))) { bufUsed.add(preBuf.get(o.inst)); bufAt.set(preBuf.get(o.inst), o.inst); sites[o.inst] = byName.get(preBuf.get(o.inst)); continue; }
    if (preBuf.has(o.inst)) { bufClaimed.delete(preBuf.get(o.inst)); bufOwner.delete(preBuf.get(o.inst)); preBuf.delete(o.inst); }
    const d = driverOfPin.get(`${o.inst}:I0`);
    const pad = d && sites[d.inst];
    const top = pad && pad.py > dev.rows / 2;
    const reach = reachOf(o);
    const order = [...BUFG_ORDER.slice(top ? 0 : 4, top ? 4 : 8), ...BUFG_ORDER.slice(top ? 4 : 0, top ? 8 : 4), ...dev.bufgmux.map(b => b.name)];
    const free = order.map(n => byName.get(n)).filter((b, k, a) => b && !bufUsed.has(b.name) && !bufOwner.has(b.name) && a.indexOf(b) === k && pairOk(o.inst, b.name));
    // a buffer the driver's dedicated path reaches, whose lines reach the clock's loads (#56), else
    // any it reaches; a clock pad that reaches none (not a GCLK pin, or #56): by the pad's edge, from
    // the pad through general routing
    const ded = reach ? free.filter(b => reach.has(b.name)) : [];
    const ok = b => lineServes(o.inst, b.name);
    let b = ded.find(ok);
    if (reach && packed.insts[d.inst].kind === 'dcm') {
      b ||= ded[0];
      if (!b) throw new PlaceError(`place: ${packed.insts[o.inst].name}: no free global clock buffer reachable from ${packed.insts[d.inst].name}.${d.pin} through switches of known bits${reach.size ? ` (${[...reach].join(', ')})` : ''}`);
    } else if (!b) {
      b = free.find(ok);
      if (b && ded.length) warnings.push(`${packed.insts[d.inst].name}: the global buffer${ded.length > 1 ? 's' : ''} ${ded.map(b => b.name).join(', ')} that its pad ${pad.name} reaches on a dedicated path ${ded.length > 1 ? 'do' : 'does'} not reach every clock pin of its loads on switches of known bits: ${b.name} instead, through general routing`);
      b ||= ded[0] || free[0];
    }
    if (!b) throw new PlaceError('place: no free global clock buffer');
    bufUsed.add(b.name);
    bufAt.set(b.name, o.inst);
    takeBuf(o.inst, b.name);
    sites[o.inst] = b;
  }
}
