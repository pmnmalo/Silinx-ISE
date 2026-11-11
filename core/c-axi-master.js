// Silinx HLS (#1893, #2276): #pragma HLS INTERFACE m_axi, Vitis HLS's AXI4 master (m_axi_<bundle>_*), on core/c-axi-rtl.js.
// The function's memory ports (ap_memory's) are served over the bundle's bus in bursts, as Vitis HLS makes them: a read
// that misses fetches a burst from its element on (up to max_read_burst_length beats, 16 by default, within its array and
// its 4 KB page) into a buffer of its port, the next reads of the burst then served from it at once, as a memory's; a
// write goes into a buffer of its port, the consecutive ones gathered into a burst (up to max_write_burst_length beats),
// written out when the buffer is full, when a write does not follow it, when a read misses and when the function is
// done (ap_done waits for it). A write updates the read buffers that hold its beat. While an access is not served
// ap_ce is 0 and the module waits; the value read reaches _q0 as a memory's would, the cycle after. A word's bytes on
// their lanes of the bus. Isomorphic ES module: no DOM and no Node APIs.
//
//   masterPorts(bundle, w) -> the ports, in Vitis HLS's names and widths
//   masterBus(rtl, bundle, w, clients, ceNet, { done, rlen, wlen }) -> { ok: "no access waits", flushed: "no write
//     waits to go out" }; each client { name, w, bytes, off, stride (a struct's member: its offset, the struct's size),
//     n (its elements, or null), base (the node of its address), ce, we, addr, d, read, written }; done: the module's
//     ap_done (its writes then written out, its read buffers emptied), or null (each write out at once)
const P = (b, n, dir, w) => ({ name: `m_axi_${b}_${n}`, dir, w });
const log2 = (n) => Math.log2(n);
export const BURST = 16;   // (Vitis HLS's max_read_burst_length and max_write_burst_length)

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

export function masterBus(r, b, w, clients, ceNet, { done = null, rlen = BURST, wlen = BURST } = {}) {
  const M = (n) => `m_axi_${b}_${n}`, reg = (n, wd) => r.reg(`m_${b}_${n}`, wd), g = r.g;
  const U = (x) => ({ w: x, s: false }), BY = w / 8, lg = log2(BY), AB = 64 - lg;
  const add = (a, x) => g.add('add', [a, x], U(g.get(a).w)), sub = (a, x) => g.add('sub', [a, x], U(g.get(a).w));
  const lt = (a, x) => g.add('lt', [a, x], U(1)), eq = (a, x) => g.add('eq', [a, x], U(1));
  const band = (a, x) => g.add('and', [a, x], U(g.get(a).w)), bor = (a, x) => g.add('or', [a, x], U(g.get(a).w)), bnot = (a) => g.add('not', [a], U(g.get(a).w));
  const min = (a, x) => r.mux(lt(a, x), a, x);
  const RL = Math.max(1, Math.min(256, rlen)), WL = done ? Math.max(1, Math.min(256, wlen)) : 1;
  const CW = 9;   // (a count of beats, 0 to 256)
  const st = reg('state', 3), cw = Math.max(1, clients.length.toString(2).length);
  const who = reg('who', cw), baddr = reg('addr', AB), blen = reg('len', 8), beat = reg('beat', 8);
  const RVALID = r.in(M('RVALID'), 1), RDATA = r.in(M('RDATA'), w), ARREADY = r.in(M('ARREADY'), 1), AWREADY = r.in(M('AWREADY'), 1), WREADY = r.in(M('WREADY'), 1), BVALID = r.in(M('BVALID'), 1);
  const at = (k) => r.is(st, k), to = (k) => r.const(k, 3);
  const amount = (lane) => r.shl(r.ext(lane, lg + 3), 3);
  const times = (a, k) => [...k.toString(2)].reverse().reduce((acc, bit, i) => (bit === '1' ? (acc === null ? r.shl(a, i) : add(acc, r.shl(a, i))) : acc), null) ?? r.const(0, 64);
  const byteAddr = (c) => add(add(c.base, r.const(c.off ?? 0, 64)), times(r.ext(c.addr, 64), c.stride ?? c.bytes));
  const lastBeat = r.and(at(R), RVALID, eq(beat, blen)), lastW = r.and(at(W), WREADY, eq(beat, blen));
  const fill = r.and(at(R), RVALID), bdone = r.and(at(B), BVALID);
  // each client's access: its beat, its lane, its data and byte mask on the bus
  const xs = clients.map((c, k) => {
    const A = byteAddr(c), ba = r.slice(A, 63, lg), lane = r.slice(A, lg - 1, 0);
    const isW = c.we ?? r.const(0, 1);
    const x = { c, k, A, ba, lane, rd: r.and(c.ce, r.not(isW)), wr: r.and(c.ce, isW), served: reg(`served${k}`, 1), mine: r.is(who, k) };
    if (c.written) {
      x.dsh = g.add('shl', [r.ext(c.d, w), amount(lane)], U(w));
      x.bm = g.add('shl', [r.const((1n << BigInt(8 * c.bytes)) - 1n, w), amount(lane)], U(w));
      x.sm = g.add('shl', [r.const((1n << BigInt(c.bytes)) - 1n, BY), r.ext(lane, BY)], U(BY));
    }
    return x;
  });
  const merge = (old, x) => bor(band(old, bnot(x.bm)), band(x.dsh, x.bm));
  // the read buffers: a burst's beats from the beat rb on, rn of them in so far
  for (const x of xs.filter((y) => y.c.read)) {
    x.rv = reg(`rv${x.k}`, 1); x.rb = reg(`rb${x.k}`, AB); x.rn = reg(`rn${x.k}`, CW);
    x.rbuf = Array.from({ length: RL }, (_, j) => reg(`rbuf${x.k}_${j}`, w));
    const off = sub(x.ba, x.rb);
    x.hit = r.and(x.rd, x.rv, lt(off, r.ext(x.rn, AB)));
    const beatData = x.rbuf.slice(1).reduce((acc, q, j) => r.mux(r.is(off, j + 1), q, acc), x.rbuf[0]);
    x.data = r.slice(g.add('shr', [beatData, amount(x.lane)], U(w)), x.c.w - 1, 0);
    x.miss = r.and(x.rd, r.not(x.hit), r.not(x.served));
    // (the burst's length: to the array's end, at most RL beats, not across a 4 KB page)
    const c = x.c;
    const toEnd = c.n ? add(sub(r.slice(add(c.base, r.const((c.off ?? 0) + (c.n - 1) * (c.stride ?? c.bytes) + c.bytes - 1, 64)), 63, lg), x.ba), r.const(1, AB)) : r.const(1, AB);
    const to4K = sub(r.const(4096 / BY, 13), r.ext(r.slice(x.ba, 11 - lg, 0), 13));
    x.n = r.slice(min(r.ext(r.slice(min(toEnd, r.const(RL, AB)), CW - 1, 0), 13), to4K), CW - 1, 0);
  }
  // the write buffers: consecutive beats from wb on, wn of them, each with its byte strobes
  for (const x of xs.filter((y) => y.c.written)) {
    x.wn = reg(`wn${x.k}`, CW); x.wb = reg(`wb${x.k}`, AB);
    x.wbuf = Array.from({ length: WL }, (_, j) => reg(`wbuf${x.k}_${j}`, w));
    x.wst = Array.from({ length: WL }, (_, j) => reg(`wst${x.k}_${j}`, BY));
    const empty = r.is(x.wn, 0), end = add(x.wb, r.ext(x.wn, AB));
    x.onLast = r.and(r.not(empty), eq(add(x.ba, r.const(1, AB)), end));
    const page = AB > 12 - lg ? r.is(r.slice(x.ba, 11 - lg, 0), 0) : r.const(0, 1);
    x.fits = r.or(empty, x.onLast, r.and(eq(x.ba, end), lt(x.wn, r.const(WL, CW)), r.not(page)));
    x.want = r.and(x.wr, r.not(x.served));
    x.full = r.is(x.wn, WL);
  }
  const W_ = xs.filter((y) => y.c.written), R_ = xs.filter((y) => y.c.read);
  const any = (a) => (a.length ? r.or(...a) : r.const(0, 1));
  const pend = any(W_.map((x) => r.not(r.is(x.wn, 0))));
  const missing = any(R_.map((x) => x.miss));
  const flushNow = r.and(pend, r.or(missing, any(W_.map((x) => r.and(x.want, r.not(x.fits)))), any(W_.map((x) => x.full)), done ?? r.const(1, 1)));
  const readNow = r.and(r.not(pend), missing);
  const go = r.and(at(IDLE), r.or(flushNow, readNow));
  // (the first that waits)
  const first = (list, f, cond, other) => list.reduceRight((acc, x) => r.mux(cond(x), f(x), acc), other);
  const flushOf = (x) => r.not(r.is(x.wn, 0));
  const target = r.mux(flushNow, first(W_, (x) => r.const(x.k, cw), flushOf, r.const(0, cw)), first(R_, (x) => r.const(x.k, cw), (x) => x.miss, r.const(0, cw)));
  const tAddr = r.mux(flushNow, first(W_, (x) => x.wb, flushOf, r.const(0, AB)), first(R_, (x) => x.ba, (x) => x.miss, r.const(0, AB)));
  const tLen = r.mux(flushNow, first(W_, (x) => r.slice(sub(x.wn, r.const(1, CW)), 7, 0), flushOf, r.const(0, 8)), first(R_, (x) => r.slice(sub(x.n, r.const(1, CW)), 7, 0), (x) => x.miss, r.const(0, 8)));
  r.next(who, r.mux(go, target, who));
  r.next(baddr, r.mux(go, tAddr, baddr));
  r.next(blen, r.mux(go, tLen, blen));
  r.next(beat, r.mux(r.or(fill, r.and(at(W), WREADY)), add(beat, r.const(1, 8)), r.mux(go, r.const(0, 8), beat)));
  r.next(st, r.mux(at(IDLE), r.mux(flushNow, to(AW), r.mux(readNow, to(AR), to(IDLE))),
    r.mux(at(AR), r.mux(ARREADY, to(R), to(AR)), r.mux(at(R), r.mux(lastBeat, to(IDLE), to(R)),
      r.mux(at(AW), r.mux(AWREADY, to(W), to(AW)), r.mux(at(W), r.mux(lastW, to(B), to(W)), r.mux(BVALID, to(IDLE), to(B))))))));
  // a write taken into its buffer: one a cycle, when the bus is idle and starts nothing
  let taken = r.const(0, 1);
  for (const x of W_) {
    x.take = r.and(x.want, x.fits, at(IDLE), r.not(go), r.not(taken));
    taken = r.or(taken, r.and(x.want, x.fits));
    const empty = r.is(x.wn, 0);
    const idx = r.mux(empty, r.const(0, CW), r.mux(x.onLast, sub(x.wn, r.const(1, CW)), x.wn));
    x.wbuf.forEach((q, j) => {
      const here = r.and(x.take, r.is(idx, j));
      r.next(q, r.mux(here, r.mux(x.onLast, merge(q, x), band(x.dsh, x.bm)), q));
      r.next(x.wst[j], r.mux(here, r.mux(x.onLast, bor(x.wst[j], x.sm), x.sm), x.wst[j]));
    });
    r.next(x.wb, r.mux(r.and(x.take, empty), x.ba, x.wb));
    r.next(x.wn, r.mux(r.and(bdone, x.mine), r.const(0, CW), r.mux(r.and(x.take, r.not(x.onLast)), add(x.wn, r.const(1, CW)), x.wn)));
  }
  // the read buffers: a burst started, its beats in; a write taken updates the beat it holds; emptied when done
  // (a write asked this cycle not out either: the module done with it, its ap_done waits)
  const flushed = r.and(at(IDLE), r.not(pend), r.not(any(W_.map((x) => x.want))));
  const clear = done ? r.and(done, flushed) : r.const(0, 1);
  for (const x of R_) {
    const start = r.and(go, r.not(flushNow), r.is(target, x.k));
    const filling = r.and(fill, x.mine);
    x.rbuf.forEach((q, j) => {
      let v = r.mux(r.and(filling, r.is(x.rn, j)), RDATA, q);
      for (const y of W_) {
        const off = sub(y.ba, x.rb);
        v = r.mux(r.and(y.take, x.rv, lt(off, r.ext(x.rn, AB)), r.is(off, j)), merge(q, y), v);
      }
      r.next(q, v);
    });
    r.next(x.rn, r.mux(start, r.const(0, CW), r.mux(filling, add(x.rn, r.const(1, CW)), x.rn)));
    r.next(x.rb, r.mux(start, x.ba, x.rb));
    r.next(x.rv, r.mux(clear, r.const(0, 1), r.mux(start, r.const(1, 1), x.rv)));
  }
  // each client served: a read when its buffer holds it, a write when its buffer takes it; kept until the module goes on
  let ok = r.const(1, 1);
  for (const x of xs) {
    const now = r.or(x.served, ...(x.c.read ? [x.hit] : []), ...(x.c.written ? [x.take] : []));
    r.next(x.served, r.mux(ceNet, r.const(0, 1), now));
    if (x.c.read) {
      const next = reg(`next${x.k}`, x.c.w), q = reg(`q${x.k}`, x.c.w);
      r.next(next, r.mux(r.and(x.hit, r.not(x.served)), x.data, next));
      r.next(q, r.mux(r.and(ceNet, x.c.ce), r.mux(x.served, next, x.data), q));
      x.c.q = q;
    }
    ok = r.and(ok, r.or(r.not(x.c.ce), now));
  }
  // the bus's channels
  const pick = (list, f, other) => list.reduceRight((acc, x) => r.mux(x.mine, f(x), acc), other);
  const addr = r.cat(baddr, r.const(0, lg));
  for (const [x, valid] of [['AR', at(AR)], ['AW', at(AW)]]) {
    r.out(M(`${x}VALID`), 1, valid);
    r.out(M(`${x}ADDR`), 64, addr);
    r.out(M(`${x}LEN`), 8, blen);
    r.out(M(`${x}SIZE`), 3, r.const(lg, 3));
    r.out(M(`${x}BURST`), 2, r.const(1, 2));   // (INCR)
    r.out(M(`${x}CACHE`), 4, r.const(3, 4));
    for (const [n, wd] of [['ID', 1], ['LOCK', 2], ['PROT', 3], ['QOS', 4], ['REGION', 4], ['USER', 1]]) r.out(M(`${x}${n}`), wd, r.const(0, wd));
  }
  const at8 = (list) => list.slice(1).reduce((acc, q, j) => r.mux(r.is(beat, j + 1), q, acc), list[0]);
  r.out(M('RREADY'), 1, at(R));
  r.out(M('WVALID'), 1, at(W));
  r.out(M('WDATA'), w, pick(W_, (x) => at8(x.wbuf), r.const(0, w)));
  r.out(M('WSTRB'), BY, pick(W_, (x) => at8(x.wst), r.const(0, BY)));
  r.out(M('WLAST'), 1, eq(beat, blen));
  r.out(M('WID'), 1, r.const(0, 1));
  r.out(M('WUSER'), 1, r.const(0, 1));
  r.out(M('BREADY'), 1, at(B));
  return { ok, flushed };
}
