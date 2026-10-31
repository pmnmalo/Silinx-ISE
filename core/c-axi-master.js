// Silinx HLS (#1893): #pragma HLS INTERFACE m_axi, Vitis HLS's AXI4 master (m_axi_<bundle>_*), on core/c-axi-rtl.js. The
// function's memory ports (ap_memory's) are served one at a time, a bundle's over its bus: while an access is not done
// ap_ce is 0 and the module waits, then the value read reaches _q0 as a memory's would, the cycle after. A word's bytes
// on their lanes of the bus. Isomorphic ES module: no DOM and no Node APIs.
//
//   masterPorts(bundle, w) -> the ports, in Vitis HLS's names and widths
//   masterBus(rtl, bundle, w, clients, ceNet) -> the bundle's "no access waits" node; each client
//     { name, w, bytes, off, stride (a struct's member: its offset, the struct's size), base (the node of its address), ce,
//     we, addr, d, read, written }
const P = (b, n, dir, w) => ({ name: `m_axi_${b}_${n}`, dir, w });
const log2 = (n) => Math.log2(n);

export function masterPorts(b, w) {
  const bytes = w / 8;
  const ch = (x) => [P(b, `${x}VALID`, 'out', 1), P(b, `${x}READY`, 'in', 1), P(b, `${x}ADDR`, 'out', 64), P(b, `${x}ID`, 'out', 1), P(b, `${x}LEN`, 'out', 8), P(b, `${x}SIZE`, 'out', 3), P(b, `${x}BURST`, 'out', 2), P(b, `${x}LOCK`, 'out', 2),
    P(b, `${x}CACHE`, 'out', 4), P(b, `${x}PROT`, 'out', 3), P(b, `${x}QOS`, 'out', 4), P(b, `${x}REGION`, 'out', 4), P(b, `${x}USER`, 'out', 1)];
  return [...ch('AW'), P(b, 'WVALID', 'out', 1), P(b, 'WREADY', 'in', 1), P(b, 'WDATA', 'out', w), P(b, 'WSTRB', 'out', bytes), P(b, 'WLAST', 'out', 1), P(b, 'WID', 'out', 1), P(b, 'WUSER', 'out', 1),
    ...ch('AR'), P(b, 'RVALID', 'in', 1), P(b, 'RREADY', 'out', 1), P(b, 'RDATA', 'in', w), P(b, 'RLAST', 'in', 1), P(b, 'RID', 'in', 1), P(b, 'RUSER', 'in', 1), P(b, 'RRESP', 'in', 2),
    P(b, 'BVALID', 'in', 1), P(b, 'BREADY', 'out', 1), P(b, 'BRESP', 'in', 2), P(b, 'BID', 'in', 1), P(b, 'BUSER', 'in', 1)];
}

/** A bus's width: at least 32 bits, a word's rounded up to a power of 2 bytes, or max_widen_bitwidth= if more. */
export const busWidth = (words, widen = 0) => {
  let w = 32;
  while (w < Math.max(...words, 1)) w *= 2;
  return Math.max(w, widen);
};
export const wordBytes = (w) => { let b = 1; while (b * 8 < w) b *= 2; return b; };

const [IDLE, AR, R, AW, W, B] = [0, 1, 2, 3, 4, 5];

export function masterBus(r, b, w, clients, ceNet) {
  const M = (n) => `m_axi_${b}_${n}`, reg = (n, wd) => r.reg(`m_${b}_${n}`, wd);
  const U = (x) => ({ w: x, s: false }), bytes = w / 8, lg = log2(bytes);
  const st = reg('state', 3), cw = Math.max(1, clients.length.toString(2).length);
  const who = reg('who', cw), addr = reg('addr', 64), wdata = reg('wdata', w), strb = reg('strb', bytes), size = reg('size', 3);
  const lane = r.slice(addr, lg - 1, 0);
  const amount = (a) => r.shl(r.ext(a, lg + 3), 3);
  const RVALID = r.in(M('RVALID'), 1), RDATA = r.in(M('RDATA'), w), ARREADY = r.in(M('ARREADY'), 1), AWREADY = r.in(M('AWREADY'), 1), WREADY = r.in(M('WREADY'), 1), BVALID = r.in(M('BVALID'), 1);
  const at = (k) => r.is(st, k), to = (k) => r.const(k, 3);
  const done = r.or(r.and(at(R), RVALID), r.and(at(B), BVALID));
  // each client's access: waiting, or served and kept until the module goes on
  const shifted = r.g.add('shr', [RDATA, amount(lane)], U(w));
  const pending = clients.map((c, k) => {
    const served = reg(`served${k}`, 1);
    const mine = r.and(done, r.is(who, k));
    r.next(served, r.mux(ceNet, r.const(0, 1), r.or(served, mine)));
    c.served = served;
    if (c.read) {
      const next = reg(`next${k}`, c.w), q = reg(`q${k}`, c.w);
      r.next(next, r.mux(r.and(at(R), RVALID, r.is(who, k)), r.slice(shifted, c.w - 1, 0), next));
      r.next(q, r.mux(r.and(ceNet, c.ce), next, q));
      c.q = q;
    }
    return r.and(c.ce, r.not(served));
  });
  // the first waiting
  const pick = (f, other) => clients.reduceRight((acc, c, k) => r.mux(pending[k], f(c, k), acc), other);
  const times = (a, k) => [...k.toString(2)].reverse().reduce((acc, bit, i) => (bit === '1' ? (acc === null ? r.shl(a, i) : r.g.add('add', [acc, r.shl(a, i)], U(64))) : acc), null) ?? r.const(0, 64);
  const byteAddr = (c) => r.g.add('add', [r.g.add('add', [c.base, r.const(c.off ?? 0, 64)], U(64)), times(r.ext(c.addr, 64), c.stride ?? c.bytes)], U(64));
  const any = pending.length ? r.or(...pending) : r.const(0, 1);
  const go = r.and(at(IDLE), any);
  const a0 = pick(byteAddr, r.const(0, 64));
  const lane0 = r.slice(a0, lg - 1, 0);
  const isW = pick((c) => (c.we ?? r.const(0, 1)), r.const(0, 1));
  r.next(who, r.mux(go, pick((c, k) => r.const(k, cw), r.const(0, cw)), who));
  r.next(addr, r.mux(go, a0, addr));
  r.next(size, r.mux(go, pick((c) => r.const(log2(c.bytes), 3), r.const(0, 3)), size));
  r.next(wdata, r.mux(go, r.g.add('shl', [pick((c) => (c.d != null ? r.ext(c.d, w) : r.const(0, w)), r.const(0, w)), amount(lane0)], U(w)), wdata));
  r.next(strb, r.mux(go, r.g.add('shl', [pick((c) => r.const((1n << BigInt(c.bytes)) - 1n, bytes), r.const(0, bytes)), lane0], U(bytes)), strb));
  r.next(st, r.mux(at(IDLE), r.mux(any, r.mux(isW, to(AW), to(AR)), to(IDLE)),
    r.mux(at(AR), r.mux(ARREADY, to(R), to(AR)), r.mux(at(R), r.mux(RVALID, to(IDLE), to(R)),
      r.mux(at(AW), r.mux(AWREADY, to(W), to(AW)), r.mux(at(W), r.mux(WREADY, to(B), to(W)), r.mux(BVALID, to(IDLE), to(B))))))));
  for (const [x, valid] of [['AR', at(AR)], ['AW', at(AW)]]) {
    r.out(M(`${x}VALID`), 1, valid);
    r.out(M(`${x}ADDR`), 64, addr);
    r.out(M(`${x}SIZE`), 3, size);
    r.out(M(`${x}BURST`), 2, r.const(1, 2));   // (INCR)
    r.out(M(`${x}CACHE`), 4, r.const(3, 4));
    for (const [n, wd] of [['ID', 1], ['LEN', 8], ['LOCK', 2], ['PROT', 3], ['QOS', 4], ['REGION', 4], ['USER', 1]]) r.out(M(`${x}${n}`), wd, r.const(0, wd));
  }
  r.out(M('RREADY'), 1, at(R));
  r.out(M('WVALID'), 1, at(W));
  r.out(M('WDATA'), w, wdata);
  r.out(M('WSTRB'), bytes, strb);
  r.out(M('WLAST'), 1, r.const(1, 1));
  r.out(M('WID'), 1, r.const(0, 1));
  r.out(M('WUSER'), 1, r.const(0, 1));
  r.out(M('BREADY'), 1, at(B));
  return clients.reduce((acc, c) => r.and(acc, r.or(r.not(c.ce), c.served)), r.const(1, 1));
}
