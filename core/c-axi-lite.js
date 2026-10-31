// Silinx HLS (#1893): #pragma HLS INTERFACE s_axilite, Vitis HLS's AXI4-Lite slave (s_axi_<bundle>_*): its registers'
// map (UG1399: the block's control at 0x00, the global interrupt enable at 0x04, the interrupts' enable and status at
// 0x08 and 0x0c, then the arguments) and its logic, on core/c-axi-rtl.js. Isomorphic ES module: no DOM and no Node APIs.
//
//   liteMap(lite, corePorts, ret) -> { aw, regs: [{ port, param, dir, w, off, words, vld }] }
//   liteSlave(rtl, bundle, map, ctrl, arg) -> the slave's ports; arg(port) the register's node given to a core input
export const litePorts = (b, aw) => {
  const P = (n, dir, w) => ({ name: `s_axi_${b}_${n}`, dir, w });
  return [P('AWVALID', 'in', 1), P('AWREADY', 'out', 1), P('AWADDR', 'in', aw), P('WVALID', 'in', 1), P('WREADY', 'out', 1), P('WDATA', 'in', 32), P('WSTRB', 'in', 4),
    P('ARVALID', 'in', 1), P('ARREADY', 'out', 1), P('ARADDR', 'in', aw), P('RVALID', 'out', 1), P('RREADY', 'in', 1), P('RDATA', 'out', 32), P('RRESP', 'out', 2),
    P('BVALID', 'out', 1), P('BREADY', 'in', 1), P('BRESP', 'out', 2)];
};

/** The bundle's registers from 0x10: a value a 32-bit word per 32 bits, an output's control word (bit 0 its ap_vld, cleared
 *  when read), a reserved word after each; ap_return first, and with no reserved word. offset= an argument's own. */
export function liteMap(args, corePorts, { ret = false, extra = [] } = {}) {
  const regs = [];
  let at = 0x10;
  const words = (w) => Math.ceil(w / 32);
  if (ret) {
    const r = corePorts.find((p) => p.name === 'ap_return');
    if (r) { regs.push({ port: 'ap_return', dir: 'out', w: r.w, off: at, words: words(r.w), ret: true }); at += Math.max(8, 4 * words(r.w)); }
  }
  for (const [param, cfg] of args) {
    if (cfg.offset !== undefined) at = cfg.offset;
    for (const p of corePorts.filter((x) => x.role === 'arg' && x.param === param)) {
      const vld = corePorts.some((x) => x.name === `${p.name}_ap_vld`);
      regs.push({ port: p.name, param, dir: p.dir, w: p.w, off: at, words: words(p.w), vld, fields: p.fields });
      at += 4 * words(p.w) + (p.dir === 'out' ? 4 : 0) + 4;
    }
    for (const e of extra.filter((x) => x.param === param)) {
      if (cfg.offset !== undefined) at = cfg.offset;
      regs.push({ ...e, off: at, words: words(e.w) });
      at += 4 * words(e.w) + 4;
    }
  }
  const end = Math.max(at, 0x10, ...regs.map((r) => r.off + 4 * r.words + (r.dir === 'out' && r.vld ? 4 : 0)));
  // (at least 5 bits, as Vitis HLS's, even of the block's four registers alone: test/hls-corpus/vitis.json)
  const last = regs.length ? Math.max(...regs.map((r) => r.off + 4 * r.words + (r.dir === 'out' && !r.ret ? 4 : 0))) - 1 : end - 1;
  return { aw: Math.max(5, last.toString(2).length), regs };
}

/** The slave's logic. ctrl: null or the block protocol's nodes { done, ready, idle } (its bits, ap_start the result's
 *  start); out(port): the node of a core's output; returns { start, regNode(port) }. */
export function liteSlave(r, bundle, map, ctrl, coreOut) {
  const { aw, regs } = map;
  const S = (n) => `s_axi_${bundle}_${n}`, reg = (n, w, k) => r.reg(`${bundle}_${n}`, w, k);
  const AWVALID = r.in(S('AWVALID'), 1), AWADDR = r.in(S('AWADDR'), aw), WVALID = r.in(S('WVALID'), 1), WDATA = r.in(S('WDATA'), 32), WSTRB = r.in(S('WSTRB'), 4);
  const ARVALID = r.in(S('ARVALID'), 1), ARADDR = r.in(S('ARADDR'), aw), RREADY = r.in(S('RREADY'), 1), BREADY = r.in(S('BREADY'), 1);
  // a write: its address (0), its data (1), its response (2); a read: its address (0), its data (1)
  const ws = reg('wstate', 2), rs = reg('rstate', 1), waddr = reg('waddr', aw), rdata = reg('rdata', 32);
  const wIdle = r.is(ws, 0), wData = r.is(ws, 1), wResp = r.is(ws, 2), rIdle = r.is(rs, 0);
  r.next(ws, r.mux(wIdle, r.mux(AWVALID, r.const(1, 2), r.const(0, 2)), r.mux(wData, r.mux(WVALID, r.const(2, 2), r.const(1, 2)), r.mux(BREADY, r.const(0, 2), r.const(2, 2)))));
  r.next(waddr, r.mux(r.and(wIdle, AWVALID), AWADDR, waddr));
  r.next(rs, r.mux(rIdle, ARVALID, r.not(RREADY)));
  const wHit = r.and(wData, WVALID), rHit = r.and(rIdle, ARVALID);
  const word = (a) => r.slice(a, aw - 1, 2);
  const wAt = (off) => r.and(wHit, r.is(word(waddr), off >> 2));
  const rAt = (off) => r.and(rHit, r.is(word(ARADDR), off >> 2));
  const b = (x, k) => r.slice(x, k, k);
  // a byte's write enable: the written word over the old one
  const strobed = (old) => [3, 2, 1, 0].map((k) => r.mux(b(WSTRB, k), r.slice(WDATA, 8 * k + 7, 8 * k), r.slice(old, 8 * k + 7, 8 * k))).reduce((hi, lo) => r.cat(hi, lo));
  let read = r.const(0, 32);
  const readable = (off, node) => { read = r.mux(r.is(word(ARADDR), off >> 2), r.ext(node, 32), read); };
  const nodes = new Map();
  let start = null;
  if (ctrl) {
    const st = reg('ap_start', 1), done = reg('ap_done', 1), ready = reg('ap_ready', 1), auto = reg('auto_restart', 1);
    const gier = reg('gier', 1), ier = reg('ier', 2), isr = reg('isr', 2);
    const ctl = wAt(0), go = r.and(ctl, b(WSTRB, 0), b(WDATA, 0));
    r.next(st, r.or(go, r.mux(ctrl.ready, auto, st)));
    r.next(auto, r.mux(r.and(ctl, b(WSTRB, 0)), b(WDATA, 7), auto));
    const cor = (x, ev) => r.or(ev, r.and(x, r.not(rAt(0))));
    r.next(done, cor(done, ctrl.done));
    r.next(ready, cor(ready, ctrl.ready));
    r.next(gier, r.mux(r.and(wAt(4), b(WSTRB, 0)), b(WDATA, 0), gier));
    r.next(ier, r.mux(r.and(wAt(8), b(WSTRB, 0)), r.slice(WDATA, 1, 0), ier));
    // (the interrupts' status: an event sets its bit if enabled, a 1 written toggles it)
    const bit = (k, ev) => r.g.add('xor', [r.or(b(isr, k), r.and(ev, b(ier, k))), r.and(wAt(12), b(WSTRB, 0), b(WDATA, k))], { w: 1, s: false });
    r.next(isr, r.cat(bit(1, ctrl.ready), bit(0, ctrl.done)));
    r.out('interrupt', 1, r.and(gier, r.or(b(isr, 0), b(isr, 1))));
    readable(0, r.cat(r.cat(auto, r.const(0, 3)), r.cat(ready, r.cat(ctrl.idle, r.cat(done, st)))));
    readable(4, gier);
    readable(8, ier);
    readable(12, isr);
    start = st;
  }
  for (const m of regs) {
    const ws32 = Array.from({ length: m.words }, (_, k) => k);
    if (m.dir === 'in') {
      const parts = ws32.map((k) => {
        const x = reg(`${m.port}_${k}`, 32);
        r.next(x, r.mux(wAt(m.off + 4 * k), strobed(x), x));
        readable(m.off + 4 * k, x);
        return x;
      });
      nodes.set(m.port, parts.reduceRight((hi, lo) => r.cat(hi, lo)));
      continue;
    }
    // an output: kept when written (with ap_done, ap_return), its ap_vld cleared when read
    const src = coreOut(m.port), v = m.ret ? ctrl.done : m.vld ? coreOut(`${m.port}_ap_vld`) : null;
    ws32.forEach((k) => {
      const hi = Math.min(32 * k + 31, m.w - 1), piece = r.slice(src, hi, 32 * k);
      const x = reg(`${m.port}_${k}`, hi - 32 * k + 1);
      r.next(x, v === null ? piece : r.mux(v, piece, x));
      readable(m.off + 4 * k, x);
    });
    if (!m.ret) {
      const s = reg(`${m.port}_vld`, 1);
      r.next(s, r.or(v ?? r.const(1, 1), r.and(s, r.not(rAt(m.off + 4 * m.words)))));
      readable(m.off + 4 * m.words, s);
    }
  }
  r.next(rdata, r.mux(rHit, read, rdata));
  r.out(S('AWREADY'), 1, wIdle);
  r.out(S('WREADY'), 1, wData);
  r.out(S('BVALID'), 1, wResp);
  r.out(S('BRESP'), 2, r.const(0, 2));
  r.out(S('ARREADY'), 1, rIdle);
  r.out(S('RVALID'), 1, rs);
  r.out(S('RDATA'), 32, rdata);
  r.out(S('RRESP'), 2, r.const(0, 2));
  return { start, nodes };
}
