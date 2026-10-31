// Silinx HLS (#1893): the AXI interfaces of the top function, as Vitis HLS makes them: its module (core/c-hdl.js's, named
// <top>_core) inside one with Vitis HLS's ports: ap_clk, ap_rst_n (active low), the AXI4-Lite slaves (core/c-axi-lite.js) and
// what stays a port of its own. Isomorphic ES module: no DOM and no Node APIs.
//
//   axiPlan(fn, warn) -> { bundles: Map(bundle -> { args: Map(param -> { offset }), ret }) } | null: the top's pragmas,
//     taken out of its body
//   axiWrap(gen, plan, { name, src, lang }) -> cToHdl's result, gen.axi: { lite: [{ bundle, aw, regs }], ret, core, view }
import { Rtl } from './c-axi-rtl.js';
import { liteMap, litePorts, liteSlave } from './c-axi-lite.js';

export const modeOf = (a) => String(a.mode || Object.keys(a).find((k) => /^(ap_|s_axi|m_axi|axis|bram)/.test(k)) || '').toLowerCase();

export function axiPlan(fn) {
  const bundles = new Map();
  const items = fn.body.items;
  for (const st of items) {
    if (st.kind !== 'pragma' || st.pragma.name !== 'INTERFACE' || modeOf(st.pragma.args) !== 's_axilite') continue;
    const a = st.pragma.args, b = String(a.bundle ?? 'control');
    if (!bundles.has(b)) bundles.set(b, { args: new Map(), ret: false });
    const x = bundles.get(b);
    if (a.port === 'return') x.ret = true;
    else if (a.port) x.args.set(a.port, { ...(a.offset !== undefined && /^(0x[0-9a-f]+|\d+)$/i.test(a.offset) ? { offset: Number(a.offset) } : {}), loc: st.loc });
  }
  fn.body.items = items.filter((st) => !(st.kind === 'pragma' && st.pragma.name === 'INTERFACE' && modeOf(st.pragma.args) === 's_axilite'));
  return bundles.size ? { bundles } : null;
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
      const ps = core.filter((p) => p.param === param && p.role !== 'arg_vld');
      if (!ps.length || ps.some((p) => p.role !== 'arg')) { warn(cfg.loc, `#pragma HLS INTERFACE s_axilite port=${param}: only a scalar or a pointer to one is made a register: its interface kept`); x.args.delete(param); }
    }
  }
  const retB = [...plan.bundles].find(([, x]) => x.ret)?.[0] ?? null;
  const ctl = retB !== null && has('ap_start');
  const maps = [...plan.bundles].map(([bundle, x]) => ({ bundle, ...liteMap(x.args, core, { ret: x.ret }) }));
  const inLite = new Set(maps.flatMap((m) => m.regs.flatMap((g) => [g.port, `${g.port}_ap_vld`])));
  const net = (n) => `ap_c_${n}`;
  const direct = core.filter((p) => !['ap_clk', 'ap_rst'].includes(p.name) && !inLite.has(p.name) && !(ctl && HS.includes(p.name)));
  const inner = core.filter((p) => !['ap_clk'].includes(p.name) && !direct.includes(p));
  const coreOut = (n) => r.in(net(n), core.find((p) => p.name === n).w);
  const ctrl = ctl ? { done: coreOut('ap_done'), ready: coreOut('ap_ready'), idle: coreOut('ap_idle') } : null;
  const given = new Map();
  for (const m of maps) {
    const { start, nodes } = liteSlave(r, m.bundle, m, m.bundle === retB ? ctrl : null, coreOut);
    if (m.bundle === retB && ctl) given.set('ap_start', start);
    for (const [k, v] of nodes) given.set(k, v);
  }
  // (with its reset, active high inside; an argument's register cut to its port's width)
  const rst_n = r.in('ap_rst_n', 1);
  if (has('ap_rst')) r.out(net('ap_rst'), 1, r.not(rst_n));
  for (const [p, v] of given) r.out(net(p), core.find((x) => x.name === p).w, r.ext(v, core.find((x) => x.name === p).w));
  const module = gen.top, top = name;
  const ports = [{ name: 'ap_clk', dir: 'in', w: 1 }, { name: 'ap_rst_n', dir: 'in', w: 1 }, ...(ctl ? [{ name: 'interrupt', dir: 'out', w: 1 }] : []), ...direct, ...maps.flatMap((m) => litePorts(m.bundle, m.aw))];
  const map = core.map((p) => [p.name, p.name === 'ap_clk' || direct.includes(p) ? p.name : net(p.name)]);
  const wrapper = r.write(lang, { name: top, src, ports, instance: { module, map }, nets: inner.map((p) => ({ name: net(p.name), w: p.w })) });
  // what the co-simulation drives: the function's ports, through a bus's model (core/c-axi-bfm.js)
  const view = core.filter((p) => !HS.includes(p.name) && !['ap_clk', 'ap_rst'].includes(p.name));
  const vlds = maps.flatMap((m) => m.regs.filter((g) => g.dir === 'out' && !g.ret && !g.vld).map((g) => ({ name: `${g.port}_ap_vld`, dir: 'out', w: 1, role: 'arg_vld', param: g.param })));
  return { ...gen, top, ports, hdl: `${gen.hdl}\n${wrapper}`, diagnostics: diagnostics.sort((a, b) => a.line - b.line || a.col - b.col),
    axi: { lite: maps, ret: ctl ? retB : null, core: module, view: { ...gen, top: 'silinx_axi_bfm', ports: [{ name: 'ap_clk', dir: 'in', w: 1 }, { name: 'ap_rst', dir: 'in', w: 1 }, ...(has('ap_start') ? core.filter((p) => HS.includes(p.name)) : []), ...view, ...vlds] } } };
}
