// Silinx toolchain - the router's connection delays (#405: out of routeDesign in core/fpga/route.js): each timing
// connection's delay on its routed path (its branch's loads counted), or estimated from the distance when not routed.
import { distanceDelay, pathDelay } from './timing.js';

/** { connDelays } of routeDesign. */
export function mountConnDelays(ctx) {
  const {
    device, edgeFrom, model, tg, trees, work
  } = ctx;

  const connDelays = () => {
    const d = new Float64Array(tg.conns.length);
    work.forEach((w, i) => {
      const tree = trees[i];
      const parent = new Map(), children = new Map();
      if (tree) for (const [n, e] of tree) { const p = e < 0 ? -1 : edgeFrom[e]; parent.set(n, p); if (p >= 0) children.set(p, (children.get(p) || 0) + 1); }
      for (const s of w.sinks) {
        if (s.conn < 0) continue;
        if (!parent.has(s.node)) { d[s.conn] = distanceDelay(w.sources[0], s.node, device, model); continue; }
        const path = [];
        for (let n = s.node; n !== -1; n = parent.get(n)) path.push(n);
        d[s.conn] = pathDelay(path.reverse(), { children }, device, model);
      }
    });
    return d;
  };

  return { connDelays };
}
