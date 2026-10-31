// Silinx HLS (#1893): the AXI interfaces of the top function, as Vitis HLS makes them: its module (core/c-hdl.js's, named
// <top>_core) inside one with Vitis HLS's ports: ap_clk, ap_rst_n (active low), the AXI4-Lite slaves (core/c-axi-lite.js), the
// AXI4 masters (core/c-axi-master.js) and
// what stays a port of its own. Isomorphic ES module: no DOM and no Node APIs.
//
//   axiPlan(fn, consts) -> { bundles: Map(bundle -> { args: Map(param -> { offset }), ret }), masters: Map(port -> { bundle, offset,
//     widen, of }) } | null: the top's pragmas, taken out of its body
//   axiWrap(gen, plan, { name, src, lang }) -> cToHdl's result, gen.axi: { lite: [{ bundle, aw, regs }], ret, core, view }
import { Rtl } from './c-axi-rtl.js';
import { liteMap, litePorts, liteSlave } from './c-axi-lite.js';
import { masterBus, masterPorts, busWidth, wordBytes } from './c-axi-master.js';

export const modeOf = (a) => String(a.mode || Object.keys(a).find((k) => /^(ap_|s_axi|m_axi|axis|bram)/.test(k)) || '').toLowerCase();

export function axiPlan(fn, consts = new Map()) {
  const bundles = new Map(), masters = new Map();
  const made = (st) => st.kind === 'pragma' && st.pragma.name === 'INTERFACE' && ['s_axilite', 'm_axi'].includes(modeOf(st.pragma.args));
  for (const st of fn.body.items.filter(made)) {
    const a = st.pragma.args;
    if (modeOf(a) === 'm_axi') { if (a.port) masters.set(a.port, { bundle: String(a.bundle ?? 'gmem'), offset: String(a.offset ?? 'slave').toLowerCase(), widen: Number(consts.get(a.max_widen_bitwidth) ?? a.max_widen_bitwidth) || 0, of: st.pragma.of, loc: st.loc }); continue; }
    const b = String(a.bundle ?? 'control');
    if (!bundles.has(b)) bundles.set(b, { args: new Map(), ret: false });
    const x = bundles.get(b);
    if (a.port === 'return') x.ret = true;
    else if (a.port) x.args.set(st.pragma.of ?? a.port, { ...(a.offset !== undefined && /^(0x[0-9a-f]+|\d+)$/i.test(a.offset) ? { offset: Number(a.offset) } : {}), loc: st.loc });
  }
  fn.body.items = fn.body.items.filter((st) => !made(st));
  // (a master's address: a register of the slave that names it, else of control; offset=direct a port, off 0)
  const order = fn.params.map((p) => p.name);
  for (const [port, m] of masters) {
    if (m.offset !== 'slave') continue;
    const key = m.of ?? port;
    if (![...bundles.values()].some((x) => x.args.has(key))) {
      if (!bundles.has('control')) bundles.set('control', { args: new Map(), ret: false });
      bundles.get('control').args.set(key, {});
    }
  }
  // (the registers in the arguments' order)
  for (const x of bundles.values()) {
    const rank = (n) => { const k = order.findIndex((o) => o === n || masters.get(o)?.of === n); return k < 0 ? order.length : k; };
    x.args = new Map([...x.args].sort(([a], [b]) => rank(a) - rank(b)));
  }
  return bundles.size || masters.size ? { bundles, masters } : null;
}

const HS = ['ap_start', 'ap_done', 'ap_idle', 'ap_ready'];

export function axiWrap(gen, plan, { name, src, lang, file }) {
  const core = gen.ports, has = (n) => core.some((p) => p.name === n);
  const r = new Rtl();
  const diagnostics = [...gen.diagnostics];
  const warn = (loc, message) => diagnostics.push({ file, line: loc?.line || 1, col: loc?.col || 1, message, severity: 'warning' });
  // (an argument that is no register's: a memory or a stream keeps its interface, said)
  for (const x of plan.bundles.values()) {
    for (const [param, cfg] of [...x.args]) {
      if ([...plan.masters].some(([port, m]) => port === param || m.of === param)) continue;
      const ps = core.filter((p) => p.param === param && p.role !== 'arg_vld');
      if (!ps.length || ps.some((p) => p.role !== 'arg')) { warn(cfg.loc, `#pragma HLS INTERFACE s_axilite port=${param}: only a scalar or a pointer to one is made a register: its interface kept`); x.args.delete(param); }
    }
  }
  const retB = [...plan.bundles].find(([, x]) => x.ret)?.[0] ?? null;
  const ctl = retB !== null && has('ap_start');
  // the masters' memories, by bundle; one's address a register (64 bits), a port or 0
  const masterOf = (x) => plan.masters.get(x.name) ?? [...plan.masters.values()].find((m) => m.of === x.name);
  const clients = (gen.memories || []).filter(masterOf).map((x) => ({ x, m: masterOf(x), key: masterOf(x).of ?? x.name }));
  // (a struct's members, memories of their own: each at its offset in the struct, laid out as C's, its elements a struct apart)
  for (const key of new Set(clients.map((c) => c.key))) {
    const mine = clients.filter((c) => c.key === key);
    let at = 0, align = 1;
    for (const c of mine) { const b = wordBytes(c.x.w); at = Math.ceil(at / b) * b; c.off = at; at += b; align = Math.max(align, b); }
    const stride = Math.ceil(at / align) * align;
    for (const c of mine) c.stride = stride;
  }
  for (const [port, m] of plan.masters) if (!m.of && !clients.some((c) => c.key === port)) warn(m.loc, `#pragma HLS INTERFACE m_axi port=${port} is not made yet: only of an array or a pointer indexed or read and written as *${port}; its interface kept`);
  const extra = [...new Set(clients.filter((c) => c.m.offset === 'slave').map((c) => c.key))].map((param) => ({ param, port: `${param}_base`, dir: 'in', w: 64, base: true }));
  const maps = [...plan.bundles].map(([bundle, x]) => ({ bundle, ...liteMap(x.args, core, { ret: x.ret, extra }) }));
  const inLite = new Set(maps.flatMap((m) => m.regs.flatMap((g) => [g.port, `${g.port}_ap_vld`])));
  const net = (n) => `ap_c_${n}`;
  const ofClient = new Set(clients.flatMap((c) => ['_address0', '_ce0', '_we0', '_d0', '_q0'].map((sfx) => `${c.x.port ?? c.x.name}${sfx}`)));
  const stalled = has('ap_ce');
  const gated = stalled ? core.filter((p) => p.role === 'fifo' && p.dir === 'out' && /_(read|write)$/.test(p.name)) : [];
  const direct = core.filter((p) => !['ap_clk', 'ap_rst', 'ap_ce'].includes(p.name) && !inLite.has(p.name) && !ofClient.has(p.name) && !(ctl && HS.includes(p.name)));
  const inner = core.filter((p) => !['ap_clk'].includes(p.name) && (!direct.includes(p) || gated.includes(p)));
  const coreOut = (n) => r.in(net(n), core.find((p) => p.name === n).w);
  const ctrl = ctl ? { done: coreOut('ap_done'), ready: coreOut('ap_ready'), idle: coreOut('ap_idle') } : null;
  const given = new Map();
  for (const m of maps) {
    const { start, nodes } = liteSlave(r, m.bundle, m, m.bundle === retB ? ctrl : null, coreOut);
    if (m.bundle === retB && ctl) given.set('ap_start', start);
    for (const [k, v] of nodes) given.set(k, v);
  }
  const ce = stalled ? r.in(net('ap_ce'), 1) : null;
  const buses = [...new Set(clients.map((c) => c.m.bundle))].map((bundle) => {
    const mine = clients.filter((c) => c.m.bundle === bundle);
    const w = busWidth([...new Set(mine.map((c) => c.key))].map((k) => 8 * mine.find((c) => c.key === k).stride), Math.max(...mine.map((c) => c.m.widen)));
    return { bundle, w, clients: mine.map(({ x, m, key, off, stride }) => {
      const P = x.port ?? x.name, cp = (sfx) => coreOut(`${P}${sfx}`);
      const base = m.offset === 'slave' ? given.get(`${key}_base`) : m.offset === 'direct' ? r.in(key, 64) : r.const(0, 64);
      return { name: P, q0: `${P}_q0`, key, offset: m.offset, w: x.w, bytes: wordBytes(x.w), off, stride, base, ce: cp('_ce0'), we: x.written ? cp('_we0') : null, d: x.written ? cp('_d0') : null, addr: cp('_address0'), read: !!x.read, written: !!x.written };
    }) };
  });
  if (stalled) {
    const oks = buses.map((b) => masterBus(r, b.bundle, b.w, b.clients, ce));
    r.out(net('ap_ce'), 1, oks.reduce((a, b) => r.and(a, b), r.const(1, 1)));
    for (const b of buses) for (const c of b.clients) if (c.read) r.out(net(c.q0), c.w, c.q);
    for (const p of gated) r.out(p.name, 1, r.and(r.in(net(p.name), 1), ce));
  }
  // (with its reset, active high inside; an argument's register cut to its port's width)
  const rst_n = r.in('ap_rst_n', 1);
  if (has('ap_rst')) r.out(net('ap_rst'), 1, r.not(rst_n));
  for (const [p, v] of [...given].filter(([k]) => has(k))) r.out(net(p), core.find((x) => x.name === p).w, r.ext(v, core.find((x) => x.name === p).w));
  const module = gen.top, top = name;
  const ports = [{ name: 'ap_clk', dir: 'in', w: 1 }, { name: 'ap_rst_n', dir: 'in', w: 1 }, ...(ctl ? [{ name: 'interrupt', dir: 'out', w: 1 }] : []), ...direct, ...clients.filter((c) => c.m.offset === 'direct').map((c) => ({ name: c.key, dir: 'in', w: 64 })), ...maps.flatMap((m) => litePorts(m.bundle, m.aw)), ...buses.flatMap((b) => masterPorts(b.bundle, b.w))];
  const map = core.map((p) => [p.name, p.name === 'ap_clk' || (direct.includes(p) && !gated.includes(p)) ? p.name : net(p.name)]);
  const wrapper = r.write(lang, { name: top, src, ports, instance: { module, map }, nets: inner.map((p) => ({ name: net(p.name), w: p.w })) });
  // what the co-simulation drives: the function's ports, through a bus's model (core/c-axi-bfm.js)
  const view = core.filter((p) => !HS.includes(p.name) && !['ap_clk', 'ap_rst', 'ap_ce'].includes(p.name));
  const vlds = maps.flatMap((m) => m.regs.filter((g) => g.dir === 'out' && !g.ret && !g.vld).map((g) => ({ name: `${g.port}_ap_vld`, dir: 'out', w: 1, role: 'arg_vld', param: g.param })));
  return { ...gen, top, ports, hdl: `${gen.hdl}\n${wrapper}`, diagnostics: diagnostics.sort((a, b) => a.line - b.line || a.col - b.col),
    axi: { lite: maps, buses: buses.map((b) => ({ bundle: b.bundle, w: b.w, clients: b.clients.map(({ name, key, w, bytes, off, stride, read, written, offset }) => ({ name, key, w, bytes, off, stride, read, written, offset })) })), ret: ctl ? retB : null, core: module, view: { ...gen, top: 'silinx_axi_bfm', ports: [{ name: 'ap_clk', dir: 'in', w: 1 }, { name: 'ap_rst', dir: 'in', w: 1 }, ...(has('ap_start') ? core.filter((p) => HS.includes(p.name)) : []), ...view, ...vlds] } } };
}
