// Silinx HLS (#1903): the RTL blackbox, Vitis HLS's syn.blackbox: a JSON description names a C function, its C model (the
// C simulation's) and a hand-written VHDL or Verilog module (the synthesis's, instantiated in place of each call). In the
// sequential machine (core/c-fsmd.js) a call is: its arguments held in registers, a state that pulses ap_start once and
// waits for ap_done (or, with no ap_done, the description's latency), each output taken when its valid is 1, else with
// ap_done. ap_ce and ap_continue are held at 1. Scalars and references only: a memory or a stream port is refused.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   loadBlackboxes([{ file, text }], headers) -> { list: [description], diagnostics }
//   withModels(source, headers, list) -> { source, headers }: the C models added, for the C simulation
//   applyBlackboxes(checked, list, report): the functions replaced, for the synthesis
import { BOOL, typeOf } from './c-types.js';
import { parse as parseVerilog } from './verilog/parser.js';
import { parse as parseVhdl } from './vhdl/parser.js';

const KEYS = new Set(['c_function_name', 'rtl_top_module_name', 'c_files', 'rtl_files', 'c_parameters', 'c_return', 'rtl_common_signal', 'rtl_performance', 'rtl_resource_usage']);
const SCALAR = new Set(['data_read_in', 'data_write_out', 'data_write_valid']);
const COMMON = { module_clock: 'clock', module_reset: 'reset', module_clock_enable: 'ce', ap_ctrl_chain_protocol_idle: 'idle', ap_ctrl_chain_protocol_start: 'start', ap_ctrl_chain_protocol_ready: 'ready', ap_ctrl_chain_protocol_done: 'done', ap_ctrl_chain_protocol_continue: 'cont' };
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const dirOf = (p) => (p.includes('/') ? p.replace(/[^/]*$/, '') : '');
const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x);

function norm(p) {
  const out = [];
  for (const s of p.split('/')) { if (s === '..' && out.length && out.at(-1) !== '..') out.pop(); else if (s !== '.') out.push(s); }
  return out.join('/');
}
/** A file a description names: beside it, else by its name in the project. */
function findFile(headers, from, name) {
  const near = norm(dirOf(from) + name);
  if (near in headers) return near;
  return name in headers ? name : null;
}

/** One description's checks; the first problem of each kind said, each with the key to correct. */
function parseOne({ file, text }, headers, say) {
  const bad = (message) => say(`syn.blackbox: ${file.split('/').pop()}: ${message}`);
  let j;
  try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { bad(`not valid JSON: ${e.message}`); return null; }
  if (!isObject(j)) { bad('the description is a JSON object'); return null; }
  const n0 = say.count();
  for (const k of ['c_function_name', 'rtl_top_module_name']) if (typeof j[k] !== 'string' || !IDENT.test(j[k])) bad(`'${k}' must name an identifier`);
  if (!Array.isArray(j.rtl_files) || !j.rtl_files.length || j.rtl_files.some((f) => typeof f !== 'string')) bad("'rtl_files' must list the VHDL or Verilog files");
  if (!Array.isArray(j.c_files)) bad("'c_files' must list the C model's files");
  if (!Array.isArray(j.c_parameters)) bad("'c_parameters' must list the function's arguments");
  if (say.count() > n0) return null;
  for (const k of Object.keys(j)) if (!KEYS.has(k)) say(`syn.blackbox: ${file.split('/').pop()}: the key '${k}' is not one Silinx HLS knows: ignored`, 'warning');
  const rtl = [], models = [];
  for (const f of j.rtl_files) { const k = findFile(headers, file, f); if (k) rtl.push({ path: k, text: headers[k] }); else bad(`the RTL file '${f}' is not in the project`); }
  for (const c of j.c_files) {
    const name = typeof c === 'string' ? c : c?.c_file;
    if (typeof name !== 'string') { bad("each of 'c_files' needs its 'c_file'"); continue; }
    if (c.cflag) say(`syn.blackbox: ${file.split('/').pop()}: the cflag of '${name}' is ignored`, 'warning');
    const k = findFile(headers, file, name);
    if (k) models.push(k); else bad(`the C model '${name}' is not in the project`);
  }
  const ports = (o, what) => {
    const rp = o.rtl_ports;
    if (!isObject(rp)) { bad(`${what}: 'rtl_ports' is missing`); return null; }
    for (const [k, v] of Object.entries(rp)) {
      if (!SCALAR.has(k)) { bad(`${what}: the port kind '${k}' (a memory or a stream) is not supported yet: scalars and references only (${[...SCALAR].join(', ')})`); return null; }
      if (typeof v !== 'string' || !IDENT.test(v)) { bad(`${what}: '${k}' must name a port of the RTL module`); return null; }
    }
    return { in: rp.data_read_in ?? null, out: rp.data_write_out ?? null, vld: rp.data_write_valid ?? null };
  };
  const params = new Map();
  for (const p of j.c_parameters) {
    if (!isObject(p) || typeof p.c_name !== 'string') { bad("each of 'c_parameters' needs its 'c_name'"); continue; }
    const what = `the argument '${p.c_name}'`;
    if (params.has(p.c_name)) { bad(`${what} is described twice`); continue; }
    const dir = p.c_port_direction;
    if (!['in', 'out', 'inout'].includes(dir)) { bad(`${what}: 'c_port_direction' must be in, out or inout`); continue; }
    if (p.RAM_type !== undefined) { bad(`${what}: 'RAM_type' (a memory) is not supported yet: scalars and references only`); continue; }
    const r = ports(p, what);
    if (!r) continue;
    if (dir !== 'out' && !r.in) { bad(`${what}: an '${dir}' argument needs 'data_read_in'`); continue; }
    if (dir !== 'in' && !r.out) { bad(`${what}: an '${dir}' argument needs 'data_write_out'`); continue; }
    params.set(p.c_name, { name: p.c_name, dir, ...r });
  }
  const ret = j.c_return === undefined ? null : isObject(j.c_return) ? ports(j.c_return, "'c_return'") : (bad("'c_return' must be an object"), null);
  if (ret && !ret.out) bad("'c_return' needs 'data_write_out'");
  const common = {};
  if (j.rtl_common_signal !== undefined && !isObject(j.rtl_common_signal)) bad("'rtl_common_signal' must be an object");
  for (const [k, v] of Object.entries(j.rtl_common_signal || {})) {
    if (!COMMON[k]) { bad(`'rtl_common_signal': '${k}' is not one of ${Object.keys(COMMON).join(', ')}`); continue; }
    if (typeof v !== 'string' || !IDENT.test(v)) { bad(`'rtl_common_signal': '${k}' must name a port of the RTL module`); continue; }
    common[COMMON[k]] = v;
  }
  const lat = j.rtl_performance?.latency;
  const latency = lat === undefined ? null : /^\d+$/.test(String(lat)) ? Number(lat) : (bad(`'rtl_performance': the latency '${lat}' must be a number of cycles`), null);
  if (!common.done && latency === null) bad("the module needs 'ap_ctrl_chain_protocol_done' or 'rtl_performance' with its 'latency': when a call ends");
  if (common.done && !common.start) bad("'ap_ctrl_chain_protocol_done' needs 'ap_ctrl_chain_protocol_start'");
  if (!common.clock && (common.done || latency > 0)) bad("a module of more than one cycle needs its 'module_clock'");
  if (say.count() > n0) return null;
  return { file, name: j.c_function_name, module: j.rtl_top_module_name, rtl, models, params, ret, common, latency };
}

/** The descriptions of a project: { list, diagnostics }; an error refuses the flow, naming the feature. */
export function loadBlackboxes(blackboxes, headers) {
  const list = [], diagnostics = [];
  for (const b of blackboxes || []) {
    let errors = 0;
    const say = (message, severity = 'error') => { if (severity === 'error') errors++; diagnostics.push({ file: b.file, line: 1, col: 1, message, severity }); };
    say.count = () => errors;
    const d = parseOne(b, headers || {}, say);
    if (d) {
      if (list.some((x) => x.name === d.name)) say(`syn.blackbox: the function '${d.name}' is described twice`);
      else list.push(d);
    }
  }
  return { list, diagnostics };
}

/** The C simulation's source: the C models added, as sources of the unit (a model the source includes already, as it is). */
export function withModels(source, headers, list) {
  const inc = list.flatMap((d) => d.models).filter((m) => !source.includes(`"${m}"`) && !source.includes(`"${m.split('/').pop()}"`));
  return inc.length ? { source: `${source}\n${[...new Set(inc)].map((m) => `#include "${m}"`).join('\n')}\n`, headers } : { source, headers };
}

const intOf = (x) => (x?.op === 'int' ? Number(x.value) : null);
/** A port's width in the RTL: 1, its range's, or null when not constant. */
function widthOf(p) {
  const r = p.type?.range;
  if (!r) return p.type?.mark && /vector|signed/.test(p.type.mark) ? null : 1;
  const a = intOf(r.left), b = intOf(r.right);
  return a === null || b === null ? null : Math.abs(a - b) + 1;
}
/** The module of a description in its RTL files: its ports by name, or null when not read. */
function rtlModule(d) {
  for (const f of d.rtl) {
    const vhdl = /\.vhdl?$/i.test(f.path);
    let r;
    try { r = (vhdl ? parseVhdl : parseVerilog)(f.text, f.path); } catch { continue; }
    const m = r.units?.find((u) => u.kind === 'module' && (vhdl ? u.name.toLowerCase() === d.module.toLowerCase() : u.name === d.module));
    if (m?.ports) return m;
  }
  return null;
}

/** The synthesis: each described function a blackbox (its C body, if any, not made), its arguments and its RTL module's
 *  ports checked against the description. */
export function applyBlackboxes(checked, list, report) {
  const anyCall = new Set();
  for (const d of list) {
    const fn = checked.funcs.get(d.name);
    const say = (message) => report({ file: d.file, line: 1, col: 1, message: `syn.blackbox: ${d.file.split('/').pop()}: ${message}`, severity: 'error' });
    if (!fn) { say(`the function '${d.name}' is not declared in the C sources`); continue; }
    if (d.name === checked.top) { say(`'${d.name}' is the top function: a blackbox is a function the top calls`); continue; }
    const n = [...d.params.keys()].filter((p) => !fn.params.some((x) => x.name === p));
    if (n.length) say(`'${d.name}' has no argument '${n[0]}'`);
    const types = new Map();
    for (const pa of fn.params) {
      const P = d.params.get(pa.name);
      if (!P) { say(`the argument '${pa.name}' of '${d.name}' is not described in 'c_parameters'`); continue; }
      const ptr = pa.type.kind === 'ptr';
      const t = typeOf(ptr ? pa.type.to : pa.type);
      if (!t || (pa.type.kind !== 'int' && !ptr) || (ptr ? pa.type.to : pa.type).kind !== 'int') { say(`the argument '${pa.name}': a memory, a stream or a struct is not supported yet: scalars and references only`); continue; }
      if (!ptr && P.dir !== 'in') say(`the argument '${pa.name}' is passed by value: it can only be 'in'`);
      types.set(pa.name, t);
    }
    const rt = fn.ret.kind === 'void' ? null : typeOf(fn.ret);
    if (fn.ret.kind !== 'void' && !rt) say(`the result of '${d.name}': a scalar`);
    if (rt && !d.ret) say(`'${d.name}' returns a value: 'c_return' is missing`);
    if (!rt && fn.ret.kind === 'void' && d.ret) say(`'${d.name}' returns nothing: 'c_return' is one too many`);
    const m = rtlModule(d);
    if (!m) { say(`the RTL files do not define the module '${d.module}'`); continue; }
    const vhdl = /\.vhdl?$/i.test(d.rtl[0].path), key = (s) => (vhdl ? s.toLowerCase() : s);
    const ports = new Map(m.ports.map((p) => [key(p.name), p]));
    const named = new Set();
    const want = (name, dir, w, what) => {
      named.add(key(name));
      const p = ports.get(key(name));
      if (!p) { say(`${what}: the module '${d.module}' has no port '${name}'`); return; }
      if (dir && p.dir !== dir) say(`${what}: the port '${name}' is an ${p.dir === 'in' ? 'input' : 'output'} of '${d.module}'`);
      const pw = widthOf(p);
      if (w && pw !== null && pw !== w) say(`${what}: the port '${name}' has ${pw} bit(s), the C type ${w}`);
    };
    for (const [pn, t] of types) {
      const P = d.params.get(pn), what = `the argument '${pn}'`;
      if (P.in) want(P.in, 'in', t.w, what);
      if (P.out) want(P.out, 'out', t.w, what);
      if (P.vld) want(P.vld, 'out', 1, what);
    }
    if (d.ret && rt) { want(d.ret.out, 'out', rt.w, "'c_return'"); if (d.ret.vld) want(d.ret.vld, 'out', 1, "'c_return'"); }
    for (const [k, dir] of [['clock', 'in'], ['reset', 'in'], ['ce', 'in'], ['start', 'in'], ['cont', 'in'], ['done', 'out'], ['idle', 'out'], ['ready', 'out']]) if (d.common[k]) want(d.common[k], dir, 1, "'rtl_common_signal'");
    for (const p of m.ports) if (p.dir === 'in' && !named.has(key(p.name))) report({ file: d.file, line: 1, col: 1, message: `syn.blackbox: ${d.file.split('/').pop()}: the input '${p.name}' of '${d.module}' is not in the description: left unconnected`, severity: 'warning' });
    d.types = types; d.retType = rt;
    d.outputsOnly = m.ports.filter((p) => p.dir === 'out' && !named.has(key(p.name)));
    fn.blackbox = d;
    fn.body = null;
    anyCall.add(d.name);
  }
  return anyCall;
}

/** A project's blackboxes (the app's, the server's): its JSON files that are descriptions, with what the flows read
 *  (the headers, the descriptions' files); null when it has none. read(path) gives a file's text. */
export async function blackboxesIn(paths, read) {
  const blackboxes = [], headers = {};
  for (const f of paths.filter((p) => /\.json$/i.test(p) && !/\.(sch|asm|fsm|tt|bool|pn)\.json$/i.test(p) && !/^build\//.test(p))) {
    let text, j;
    try { text = await read(f); j = JSON.parse(text); } catch { continue; }
    if (isObject(j) && 'c_function_name' in j && 'rtl_top_module_name' in j) blackboxes.push({ file: f, text });
    else continue;
    const named = [...(Array.isArray(j.rtl_files) ? j.rtl_files : []), ...(Array.isArray(j.c_files) ? j.c_files.map((c) => (typeof c === 'string' ? c : c?.c_file)) : [])].filter((x) => typeof x === 'string');
    for (const n of named) for (const k of [norm(dirOf(f) + n), n]) if (paths.includes(k) && !(k in headers)) headers[k] = await read(k);
  }
  if (!blackboxes.length) return null;
  for (const k of paths.filter((p) => /\.(h|hh|hpp)$/i.test(p) && !/^build\//.test(p))) if (!(k in headers)) headers[k] = await read(k);
  return { blackboxes, headers };
}

const isBB = (self, n) => n?.kind === 'call' && n.callee?.kind === 'id' && !!self.c.funcs.get(n.callee.name)?.blackbox;

/** The machine's part (core/c-fsmd.js): a call's registers and its state. */
export const blackboxMethods = {
  isBlackbox(n) { return isBB(this, n); },
  hasBlackbox(x) {
    let hit = false;
    const w = (n) => {
      if (!n || typeof n !== 'object' || hit) return;
      if (Array.isArray(n)) { n.forEach(w); return; }
      if (isBB(this, n)) { hit = true; return; }
      for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type') w(v);
    };
    w(x);
    return hit;
  },
  /** A call: its inputs into registers, its state, its outputs given back after it; the expression its result. */
  hoistBlackbox(e, at) {
    const fn = this.c.funcs.get(e.callee.name), d = fn.blackbox, L = e.loc;
    const i = (this.bbInsts ||= []).length;
    const inst = { i, d, ins: [], outs: [], block: null };
    this.bbInsts.push(inst);
    const id = (name) => ({ kind: 'id', name, loc: L });
    const tmp = (name, t) => { this.slots.set(name, { kind: 'var', t, reg: this.reg(name, t), name }); return name; };
    const after = [];
    const lval = (a) => (a.kind === 'unary' && a.op === '&' ? a.e : a.kind === 'id' ? { kind: 'unary', op: '*', e: a, loc: a.loc } : a);
    const give = (rtl, vld, t, name, target) => {
      const q = tmp(`ap_bb${i}_${name}_q`, t);
      const out = { rtl, vld, w: t.w, name, q };
      inst.outs.push(out);
      if (!target) return;
      const set = { kind: 'expr', e: { kind: 'assign', op: '=', l: target, r: id(q), loc: L }, loc: L };
      // (a valid never 1: the variable as it was, as a C function that does not write it)
      if (vld) { out.any = tmp(`ap_bb${i}_${name}_any`, BOOL); after.push({ kind: 'if', cond: id(out.any), then: set, else: null, loc: L }); } else after.push(set);
    };
    fn.params.forEach((pa, k) => {
      const P = d.params.get(pa.name), t = d.types.get(pa.name), a = e.args[k], ptr = pa.type.kind === 'ptr';
      if (P.dir !== 'out') {
        const name = tmp(`ap_bb${i}_${pa.name}_i`, t);
        const v = this.hoist(ptr ? lval(a) : a, at);   // (first: it moves at.cur)
        at.cur.stmts.push({ kind: 'expr', e: { kind: 'assign', op: '=', l: id(name), r: v, loc: L }, loc: L });
        inst.ins.push({ rtl: P.in, name, w: t.w });
      }
      if (P.dir !== 'in') give(P.out, P.vld, t, pa.name, lval(a));
    });
    if (d.retType) give(d.ret.out, d.ret.vld, d.retType, 'return', null);
    if (at.cur.stmts.length) at.next();
    inst.block = at.cur;
    at.cur.stmts.push({ kind: 'bbcall', inst, loc: L });
    at.next();
    at.cur.stmts.push(...after);
    return d.retType ? id(`ap_bb${i}_return_q`) : { kind: 'num', value: 0n, text: '0', loc: L };
  },
  /** The call's state: it waits for the module's end; the outputs read as it ends. */
  bbStmt(s, base) {
    const { inst } = s, P = `ap_bb${inst.i}`;
    const sig = (name, t) => this.g.add('in', [], t, { port: { key: name, name } });
    this.stall = this.or(this.stall, this.and(this.guard(base), this.not(sig(`${P}_done`, BOOL))));
    for (const o of inst.outs) {
      const slot = this.slots.get(o.q);
      slot.val = sig(`${P}_${o.name}_v`, slot.t);
      if (o.any) this.slots.get(o.any).val = sig(`${P}_${o.name}_any`, BOOL);
    }
  },
  /** The machine's outputs to the instances, its state known. */
  bbOutputs(outputs) {
    if (!this.bbInsts?.length) return;
    const cs = this.g.add('reg', [], this.stateT, { port: { key: 'reg:ap_CS_fsm', name: 'ap_CS_fsm' } });
    for (const inst of this.bbInsts) {
      outputs.set(`ap_bb${inst.i}_go`, { node: this.g.add('eq', [cs, this.g.const(inst.block.num, this.stateT)], BOOL) });
      for (const x of inst.ins) outputs.set(`${x.name}_w`, { reg: x.name });
    }
  },
};

const vec = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
const vvec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');

/** The instances' HDL: { inner: signals, decls: { vhdl, verilog } (before the logic), vhdl, verilog }. */
export function blackboxHdl(insts) {
  const inner = [], decls = { vhdl: [], verilog: [] }, vhdl = [], verilog = [];
  const seen = new Set();
  for (const { i, d, ins, outs } of insts) {
    const P = `ap_bb${i}`, C = d.common, L = d.latency;
    inner.push({ name: `${P}_go`, w: 1 }, { name: `${P}_start`, w: 1 }, { name: `${P}_done`, w: 1 });
    for (const x of ins) inner.push({ name: `${x.name}_w`, w: x.w });
    for (const o of outs) {
      inner.push({ name: `${P}_${o.name}_o`, w: o.w }, { name: `${P}_${o.name}_v`, w: o.w });
      if (o.vld) inner.push({ name: `${P}_${o.name}_vld`, w: 1 }, { name: `${P}_${o.name}_any`, w: 1 });
    }
    // the module's ports: [name, dir, width, the signal or the constant it is joined to]
    const map = [];
    const com = (k, dir, sig) => { if (C[k]) map.push([C[k], dir, 1, sig]); };
    com('clock', 'in', 'ap_clk'); com('reset', 'in', 'ap_rst'); com('ce', 'in', 1); com('cont', 'in', 1);
    com('start', 'in', `${P}_start`); com('done', 'out', `${P}_done`); com('idle', 'out', null); com('ready', 'out', null);
    for (const x of ins) map.push([x.rtl, 'in', x.w, `${x.name}_w`]);
    for (const o of outs) { map.push([o.rtl, 'out', o.w, `${P}_${o.name}_o`]); if (o.vld) map.push([o.vld, 'out', 1, `${P}_${o.name}_vld`]); }
    for (const p of d.outputsOnly || []) map.push([p.name, 'out', widthOfOr1(p), null]);
    if (!seen.has(d.module)) {
      seen.add(d.module);
      decls.vhdl.push(`  component ${d.module}`, '    port (', ...map.map(([n, dir, w], k) => `      ${n} : ${dir} ${vec(w)}${k < map.length - 1 ? ';' : ''}`), '    );', '  end component;');
    }
    decls.vhdl.push(`  signal ${P}_started : std_logic;`);
    decls.verilog.push(`  reg ${P}_started;`);
    vhdl.push(`  ${P} : ${d.module} port map (${map.map(([n, , , s]) => `${n} => ${s === 1 ? "'1'" : s ?? 'open'}`).join(', ')});`,
      `  ${P}_start <= ${P}_go and not ${P}_started;`,
      '  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', `      if ap_rst = '1' or ${P}_done = '1' then`, `        ${P}_started <= '0';`, `      elsif ${P}_go = '1' then`, `        ${P}_started <= '1';`, '      end if;', '    end if;', '  end process;');
    verilog.push(`  ${d.module} ${P} (${map.filter(([, , , s]) => s !== null).map(([n, , , s]) => `.${n}(${s === 1 ? "1'b1" : s})`).join(', ')});`,
      `  assign ${P}_start = ${P}_go & ~${P}_started;`,
      `  always @(posedge ap_clk) if (ap_rst | ${P}_done) ${P}_started <= 1'b0; else if (${P}_go) ${P}_started <= 1'b1;`);
    // no ap_done: the end of a call counted from its start
    if (!C.done) {
      if (L === 0) { vhdl.push(`  ${P}_done <= ${P}_start;`); verilog.push(`  assign ${P}_done = ${P}_start;`); }
      else {
        decls.vhdl.push(`  signal ${P}_dly : std_logic_vector(${L - 1} downto 0);`);
        decls.verilog.push(`  reg [${L - 1}:0] ${P}_dly;`);
        vhdl.push(`  ${P}_done <= ${P}_dly(${L - 1});`, '  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', `      if ap_rst = '1' then`, `        ${P}_dly <= (others => '0');`, '      else',
          L === 1 ? `        ${P}_dly(0) <= ${P}_start;` : `        ${P}_dly <= ${P}_dly(${L - 2} downto 0) & ${P}_start;`, '      end if;', '    end if;', '  end process;');
        verilog.push(`  assign ${P}_done = ${P}_dly[${L - 1}];`, `  always @(posedge ap_clk) if (ap_rst) ${P}_dly <= 0; else ${P}_dly <= ${L === 1 ? `${P}_start` : `{${P}_dly[${L - 2}:0], ${P}_start}`};`);
      }
    }
    // each output: with a valid, taken when it is 1 and kept to the call's end; else as the call ends
    for (const o of outs) {
      const O = `${P}_${o.name}`;
      if (!o.vld) { vhdl.push(`  ${O}_v <= ${O}_o;`); verilog.push(`  assign ${O}_v = ${O}_o;`); continue; }
      decls.vhdl.push(`  signal ${O}_cap : ${vec(o.w)};`, `  signal ${O}_got : std_logic;`);
      decls.verilog.push(`  reg ${vvec(o.w)}${O}_cap;`, `  reg ${O}_got;`);
      vhdl.push(`  ${O}_v <= ${O}_o when ${O}_vld = '1' else ${O}_cap;`, `  ${O}_any <= ${O}_vld or ${O}_got;`,
        '  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', `      if ap_rst = '1' or ${P}_done = '1' then`, `        ${O}_got <= '0';`, `      elsif ${O}_vld = '1' then`, `        ${O}_got <= '1';`, `        ${O}_cap <= ${O}_o;`, '      end if;', '    end if;', '  end process;');
      verilog.push(`  assign ${O}_v = ${O}_vld ? ${O}_o : ${O}_cap;`, `  assign ${O}_any = ${O}_vld | ${O}_got;`,
        `  always @(posedge ap_clk) if (ap_rst | ${P}_done) ${O}_got <= 1'b0; else if (${O}_vld) begin ${O}_got <= 1'b1; ${O}_cap <= ${O}_o; end`);
    }
  }
  return { inner, decls, vhdl, verilog };
}
const widthOfOr1 = (p) => widthOf(p) ?? 1;
