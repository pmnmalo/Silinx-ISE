// Silinx HLS (#1903): the RTL blackbox, Vitis HLS's syn.blackbox: a JSON description names a C function, its C model (the
// C simulation's) and a hand-written VHDL or Verilog module (the synthesis's, instantiated in place of each call). In the
// sequential machine (core/c-fsmd.js) a call is: its arguments held in registers, a state that pulses ap_start once and
// waits for ap_done (or, with no ap_done, the description's latency), each output taken when its valid is 1, else with
// ap_done. ap_ce and ap_continue are held at 1. An array argument with RAM_type RAM_1P is a memory port (#2339): the
// caller's memory (its own, or the top's ap_memory) is the module's while the call's state waits for it, as a
// sub-module's (core/c-submodule.js); an hls::stream argument is a FIFO port, the caller's stream argument the module's.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   loadBlackboxes([{ file, text }], headers) -> { list: [description], diagnostics }
//   withModels(source, headers, list) -> { source, headers }: the C models added, for the C simulation
//   applyBlackboxes(checked, list, report): the functions replaced, for the synthesis
//   blackboxModels(hls) -> Set of paths: the project's C models, not modules of the design (#2341)
//   declaredBlackboxes(blackboxes, funcs) -> the descriptions of a C source's functions (#3022)
//   undeclaredBlackboxes(hls, sources) -> [diagnostic]: a warning for each description no C source declares (#3022)
import { BOOL, typeOf } from './c-types.js';
import { checkC } from './c-check.js';
import { parse as parseVerilog } from './verilog/parser.js';
import { parse as parseVhdl } from './vhdl/parser.js';

const KEYS = new Set(['c_function_name', 'rtl_top_module_name', 'c_files', 'rtl_files', 'c_parameters', 'c_return', 'rtl_common_signal', 'rtl_performance', 'rtl_resource_usage']);
const SCALAR = new Set(['data_read_in', 'data_write_out', 'data_write_valid']);
// (Vitis HLS's keys: a memory's, RAM_1P; a stream's, its flags 1 when it is not empty, not full, #2339)
const RAM = { RAM_address: 'addr', RAM_clock_enable: 'ce', RAM_write_enable: 'we', RAM_data_write_out: 'd', RAM_data_read_in: 'q' };
const FIFO = { FIFO_empty_flag: 'empty_n', FIFO_read_enable: 'read', FIFO_data_read_in: 'dout', FIFO_full_flag: 'full_n', FIFO_write_enable: 'write', FIFO_data_write_out: 'din' };
const FIFO_IN = ['FIFO_empty_flag', 'FIFO_read_enable', 'FIFO_data_read_in'], FIFO_OUT = ['FIFO_full_flag', 'FIFO_write_enable', 'FIFO_data_write_out'];
const COMMON = { module_clock: 'clock', module_reset: 'reset', module_clock_enable: 'ce', ap_ctrl_chain_protocol_idle: 'idle', ap_ctrl_chain_protocol_start: 'start', ap_ctrl_chain_protocol_ready: 'ready', ap_ctrl_chain_protocol_done: 'done', ap_ctrl_chain_protocol_continue: 'cont' };
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const dirOf = (p) => (p.includes('/') ? p.replace(/[^/]*$/, '') : '');
const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x);
/** A description's function's name, or null when it has none (its errors then loadBlackboxes's). */
const nameOf = (b) => { try { const n = JSON.parse(b.text)?.c_function_name; return typeof n === 'string' ? n : null; } catch { return null; } };

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
  const ports = (o, what, ram = false) => {
    const rp = o.rtl_ports;
    if (!isObject(rp)) { bad(`${what}: 'rtl_ports' is missing`); return null; }
    const fifo = Object.keys(rp).some((k) => k in FIFO);
    const known = ram ? RAM : fifo ? FIFO : null;
    for (const [k, v] of Object.entries(rp)) {
      if (!(known ? k in known : SCALAR.has(k))) {
        if (!ram && k in RAM) bad(`${what}: '${k}' is a memory's port: the argument needs 'RAM_type' (RAM_1P)`);
        else bad(`${what}: the port kind '${k}' is not one of ${known ? Object.keys(known).join(', ') : `a scalar's (${[...SCALAR].join(', ')}), a memory's (RAM_type and ${Object.keys(RAM).join(', ')}) or a stream's (${Object.keys(FIFO).join(', ')})`}`);
        return null;
      }
      if (typeof v !== 'string' || !IDENT.test(v)) { bad(`${what}: '${k}' must name a port of the RTL module`); return null; }
    }
    if (known) return Object.fromEntries([['kind', ram ? 'mem' : 'fifo'], ...Object.entries(known).map(([k, n]) => [n, rp[k] ?? null])]);
    return { in: rp.data_read_in ?? null, out: rp.data_write_out ?? null, vld: rp.data_write_valid ?? null };
  };
  /** A memory's or a stream's ports, as its direction needs them: the first missing one said. */
  const needs = (r, dir, what) => {
    const miss = (list) => list.find((k) => !r[(r.kind === 'mem' ? RAM : FIFO)[k]]);
    if (r.kind === 'mem') {
      const m = miss(['RAM_address', 'RAM_clock_enable', ...(dir !== 'out' ? ['RAM_data_read_in'] : []), ...(dir !== 'in' ? ['RAM_write_enable', 'RAM_data_write_out'] : [])]);
      if (m) { bad(`${what}: a memory '${dir}' needs '${m}'`); return false; }
      if (dir === 'in' && (r.we || r.d)) { bad(`${what}: a memory 'in' is only read: no 'RAM_write_enable' nor 'RAM_data_write_out'`); return false; }
      return true;
    }
    if (dir === 'inout') { bad(`${what}: a stream is read or written: 'c_port_direction' in or out`); return false; }
    const [mine, other] = dir === 'in' ? [FIFO_IN, FIFO_OUT] : [FIFO_OUT, FIFO_IN];
    const extra = other.find((k) => r[FIFO[k]]);
    if (extra) { bad(`${what}: a stream '${dir}' has no '${extra}' (${mine.join(', ')})`); return false; }
    const m = miss(mine);
    if (m) { bad(`${what}: a stream '${dir}' needs '${m}'`); return false; }
    return true;
  };
  const params = new Map();
  for (const p of j.c_parameters) {
    if (!isObject(p) || typeof p.c_name !== 'string') { bad("each of 'c_parameters' needs its 'c_name'"); continue; }
    const what = `the argument '${p.c_name}'`;
    if (params.has(p.c_name)) { bad(`${what} is described twice`); continue; }
    const dir = p.c_port_direction;
    if (!['in', 'out', 'inout'].includes(dir)) { bad(`${what}: 'c_port_direction' must be in, out or inout`); continue; }
    if (p.RAM_type !== undefined && p.RAM_type !== 'RAM_1P') { bad(p.RAM_type === 'RAM_T2P' ? `${what}: 'RAM_type' RAM_T2P (a memory of two ports) is not supported yet: RAM_1P` : `${what}: 'RAM_type' must be RAM_1P (or RAM_T2P)`); continue; }
    const r = ports(p, what, p.RAM_type !== undefined);
    if (!r) continue;
    if (r.kind) { if (needs(r, dir, what)) params.set(p.c_name, { name: p.c_name, dir, ...r }); continue; }
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
    if (!fn) continue;   // (not this source's: undeclaredBlackboxes says it once for the project, #3022)
    if (d.name === checked.top) { say(`'${d.name}' is the top function: a blackbox is a function the top calls`); continue; }
    const n = [...d.params.keys()].filter((p) => !fn.params.some((x) => x.name === p));
    if (n.length) say(`'${d.name}' has no argument '${n[0]}'`);
    const types = new Map();
    for (const pa of fn.params) {
      const P = d.params.get(pa.name);
      if (!P) { say(`the argument '${pa.name}' of '${d.name}' is not described in 'c_parameters'`); continue; }
      // (an array, a memory port; a stream, a FIFO port, #2339)
      const k = { array: 'mem', stream: 'fifo' }[pa.type.kind] ?? null;
      if (P.kind || k) {
        const t = k && pa.type.of.kind === 'int' ? typeOf(pa.type.of) : null;
        if (!k) { say(`the argument '${pa.name}' is not ${P.kind === 'mem' ? 'an array (its size: m[N])' : 'an hls::stream'}: its description has ${P.kind === 'mem' ? "a memory's ports" : "a stream's ports"}`); continue; }
        if (P.kind !== k) { say(`the argument '${pa.name}' is ${k === 'mem' ? "an array: its description needs 'RAM_type' RAM_1P and a memory's ports (RAM_…)" : "an hls::stream: its description needs a stream's ports (FIFO_…)"}`); continue; }
        if (!t) { say(`the argument '${pa.name}': an array or a stream of integers`); continue; }
        if (k === 'mem' && !pa.type.length) { say(`the argument '${pa.name}': an array of a known size (${pa.name}[N])`); continue; }
        types.set(pa.name, t);
        continue;
      }
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
    const aw = new Map();
    for (const [pn, t] of types) {
      const P = d.params.get(pn), what = `the argument '${pn}'`;
      if (P.kind === 'mem') {
        const n = fn.params.find((x) => x.name === pn).type.length, need = Math.max(1, Math.ceil(Math.log2(n)));
        want(P.addr, 'out', null, what); want(P.ce, 'out', 1, what);
        const w = ports.get(key(P.addr)) && widthOf(ports.get(key(P.addr)));
        if (w && w < need) say(`${what}: the port '${P.addr}' has ${w} bit(s), the ${n} words of '${pn}' need ${need}`);
        aw.set(pn, w || need);
        if (P.q) want(P.q, 'in', t.w, what);
        if (P.we) { want(P.we, 'out', 1, what); want(P.d, 'out', t.w, what); }
        continue;
      }
      if (P.kind === 'fifo') {
        if (P.dir === 'in') { want(P.empty_n, 'in', 1, what); want(P.read, 'out', 1, what); want(P.dout, 'in', t.w, what); } else { want(P.full_n, 'in', 1, what); want(P.write, 'out', 1, what); want(P.din, 'out', t.w, what); }
        continue;
      }
      if (P.in) want(P.in, 'in', t.w, what);
      if (P.out) want(P.out, 'out', t.w, what);
      if (P.vld) want(P.vld, 'out', 1, what);
    }
    if (d.ret && rt) { want(d.ret.out, 'out', rt.w, "'c_return'"); if (d.ret.vld) want(d.ret.vld, 'out', 1, "'c_return'"); }
    for (const [k, dir] of [['clock', 'in'], ['reset', 'in'], ['ce', 'in'], ['start', 'in'], ['cont', 'in'], ['done', 'out'], ['idle', 'out'], ['ready', 'out']]) if (d.common[k]) want(d.common[k], dir, 1, "'rtl_common_signal'");
    for (const p of m.ports) if (p.dir === 'in' && !named.has(key(p.name))) report({ file: d.file, line: 1, col: 1, message: `syn.blackbox: ${d.file.split('/').pop()}: the input '${p.name}' of '${d.module}' is not in the description: left unconnected`, severity: 'warning' });
    d.types = types; d.retType = rt; d.aw = aw;
    d.outputsOnly = m.ports.filter((p) => p.dir === 'out' && !named.has(key(p.name)));
    fn.blackbox = d;
    fn.body = null;
    anyCall.add(d.name);
  }
  return anyCall;
}

/** Check Syntax of a C source (#2995): the descriptions of the blackboxes it declares (not its top) checked as its
 *  synthesis checks them, against its functions and their RTL modules: their errors and warnings, each in its description.
 *  checked: a check of the source of its own (checkC's), its described functions made blackboxes. */
export function blackboxChecks(checked, { blackboxes = [], headers = {} } = {}) {
  const mine = (blackboxes || []).filter((b) => { const n = nameOf(b); return n !== null && n !== checked.top && checked.funcs.has(n); });
  const { list, diagnostics } = loadBlackboxes(mine, headers);
  applyBlackboxes(checked, list, (d) => diagnostics.push(d));
  return diagnostics;
}

/** The synthesis of a C source (#3022): the descriptions of the functions it declares, and those whose function cannot be
 *  read (their errors loadBlackboxes's); another source's blackbox is not its own. funcs: checkC's. */
export function declaredBlackboxes(blackboxes, funcs) {
  return (blackboxes || []).filter((b) => { const n = nameOf(b); return n === null || funcs.has(n); });
}

/** Check Syntax of a project (#3022): a warning, in the description, for each blackbox whose function no C source of the
 *  design declares (its C models not counted: a model is the C simulation's). hls: blackboxesIn's result; sources: the
 *  project's C sources, { path: text }. */
export function undeclaredBlackboxes(hls, sources) {
  if (!hls?.blackboxes?.length) return [];
  const models = blackboxModels(hls), declared = new Set();
  for (const [path, text] of Object.entries(sources || {})) {
    if (models.has(path)) continue;
    try { for (const n of checkC(String(text ?? ''), path, { headers: hls.headers || {} }).funcs.keys()) declared.add(n); } catch { /* not read */ }
  }
  return hls.blackboxes.filter((b) => nameOf(b) !== null && !declared.has(nameOf(b))).map((b) => ({ file: b.file, line: 1, col: 1, severity: 'warning',
    message: `syn.blackbox: ${b.file.split('/').pop()}: the function '${nameOf(b)}' is not declared in the C sources: not used` }));
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

/** The C models the descriptions of blackboxesIn's result name, as the project's paths: a model is the C simulation's, never
 *  a C source made into a module of the design (#2854: its function, the top of its file, refused as a blackbox's). */
export function blackboxModels(hls) {
  const out = new Set();
  for (const b of hls?.blackboxes || []) {
    let j;
    try { j = JSON.parse(b.text); } catch { continue; }
    for (const c of Array.isArray(j?.c_files) ? j.c_files : []) {
      const n = typeof c === 'string' ? c : c?.c_file;
      const f = typeof n === 'string' && findFile(hls.headers || {}, b.file, n);
      if (f) out.add(f);
    }
  }
  return out;
}

const U = (w) => ({ w, s: false });
const isBB = (self, n) => n?.kind === 'call' && n.callee?.kind === 'id' && !!self.c.funcs.get(n.callee.name)?.blackbox;

/** The machine's part (core/c-fsmd.js): a call's registers and its state. */
export const blackboxMethods = {
  isBlackbox(n) { return isBB(this, n); },
  /** A call's arguments that are not a memory's nor a stream's. */
  bbScalarArgs(e) {
    const fn = this.c.funcs.get(e.callee.name);
    return e.args.filter((a, k) => !fn.blackbox.params.get(fn.params[k]?.name)?.kind);
  },
  /** The arrays given to a blackbox's memory port: memories whatever their size (#2339). */
  bbArrays(body) {
    const out = new Set();
    const w = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(w); return; }
      if (isBB(this, n)) {
        const fn = this.c.funcs.get(n.callee.name);
        fn.params.forEach((pa, k) => { if (fn.blackbox.params.get(pa.name)?.kind === 'mem' && n.args[k]?.kind === 'id') out.add(n.args[k].name); });
      }
      for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type') w(v);
    };
    w(body);
    return out;
  },
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
    const inst = { i, d, ins: [], outs: [], ports: [], drive: new Map(), block: null };
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
      // (a memory or a stream: the caller's, its port the module's during the call, #2339)
      if (P.kind) {
        const sl = a.kind === 'id' ? this.slots.get(a.name) : null;
        const ok = P.kind === 'mem' ? sl?.kind === 'mem' && !sl.group && !sl.bram && !sl.banks && !(sl.storage === '2p' && P.dir !== 'in') : sl?.kind === 'fifo' && !sl.group;
        if (!ok) { this.error(a.loc, P.kind === 'mem' ? `the argument of '${pa.name}' in the call of the RTL blackbox '${d.name}': an array that is a memory of one port, by its name (not partitioned, not a BRAM interface, not ram_2p)` : `the argument of '${pa.name}' in the call of the RTL blackbox '${d.name}': a stream argument of the caller, by its name`); return; }
        if (P.kind === 'mem' && P.dir !== 'in') { if (sl.rom) this.error(a.loc, `'${sl.name}' is constant: the RTL blackbox '${d.name}' writes it`); sl.written = true; }
        if (P.kind === 'mem' && P.dir !== 'out') sl.read = true;
        if (P.kind === 'fifo') { if (P.dir === 'in') sl.read = true; else sl.written = true; }
        inst.ports.push({ P, name: pa.name, slot: a.name, w: t.w, aw: d.aw.get(pa.name) });
        return;
      }
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
    for (const x of inst.ports) {
      const sl = this.slots.get(x.slot), N = `${P}_${x.name}`, to = (n, t) => this.conv(this.v(n, t), U(x.w)).id;
      if (x.P.kind === 'mem') {
        const acc = { addr: this.conv(this.v(sig(`${N}_address0`, U(x.aw)), U(x.aw)), U(sl.aw)).id, ce: sig(`${N}_ce0`, BOOL), we: this.F, d: null, free: true };
        if (x.P.we) { acc.we = sig(`${N}_we0`, BOOL); acc.d = this.conv(this.v(sig(`${N}_d0`, U(x.w)), U(x.w)), sl.t).id; }
        if (x.P.q) inst.drive.set(`${N}_q0`, to(this.memQ(sl), sl.t));
        this.access.set(sl.name, acc);
        continue;
      }
      const acc = { g: sig(`${N}_${x.P.dir === 'in' ? 'read' : 'write'}`, BOOL), ok: this.T, free: true };
      if (x.P.dir === 'in') { inst.drive.set(`${N}_empty_n`, this.fifoIn(sl, 'empty_n')); inst.drive.set(`${N}_dout`, to(this.fifoIn(sl, 'dout'), sl.t)); }
      else { inst.drive.set(`${N}_full_n`, this.fifoIn(sl, 'full_n')); acc.d = this.conv(this.v(sig(`${N}_din`, U(x.w)), U(x.w)), sl.t).id; }
      this.fifoAcc.set(sl.name, acc);
    }
    for (const o of inst.outs) {
      const slot = this.slots.get(o.q);
      slot.val = sig(`${P}_${o.name}_v`, slot.t);
      if (o.any) this.slots.get(o.any).val = sig(`${P}_${o.name}_any`, BOOL);
    }
  },
  /** The machine's outputs to the instances, its state known. */
  bbOutputs(outputs) {
    if (!this.bbInsts?.length || !this.stateT) return;   // (a machine stopped by an error: none)
    const cs = this.g.add('reg', [], this.stateT, { port: { key: 'reg:ap_CS_fsm', name: 'ap_CS_fsm' } });
    for (const inst of this.bbInsts) {
      if (!inst.block) continue;   // (a call refused as it was made: the error said)
      outputs.set(`ap_bb${inst.i}_go`, { node: this.g.add('eq', [cs, this.g.const(inst.block.num, this.stateT)], BOOL) });
      for (const x of inst.ins) outputs.set(`${x.name}_w`, { reg: x.name });
      for (const [k, node] of inst.drive) outputs.set(k, { node });
    }
  },
};

const vec = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
const vvec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');

/** The instances' HDL: { inner: signals, decls: { vhdl, verilog } (before the logic), vhdl, verilog }. */
export function blackboxHdl(insts) {
  const inner = [], decls = { vhdl: [], verilog: [] }, vhdl = [], verilog = [];
  const seen = new Set();
  for (const { i, d, ins, outs, ports = [] } of insts) {
    const P = `ap_bb${i}`, C = d.common, L = d.latency;
    inner.push({ name: `${P}_go`, w: 1 }, { name: `${P}_start`, w: 1 }, { name: `${P}_done`, w: 1 });
    for (const x of ins) inner.push({ name: `${x.name}_w`, w: x.w });
    // (a memory's ports, a stream's: the module's, joined to the caller's by the machine, #2339)
    const mine = [];
    for (const { P: R, name, w, aw } of ports) {
      const N = `${P}_${name}`, j = (rtl, dir, pw, sfx) => { if (rtl) { inner.push({ name: `${N}${sfx}`, w: pw }); mine.push([rtl, dir, pw, `${N}${sfx}`]); } };
      if (R.kind === 'mem') { j(R.addr, 'out', aw, '_address0'); j(R.ce, 'out', 1, '_ce0'); j(R.we, 'out', 1, '_we0'); j(R.d, 'out', w, '_d0'); j(R.q, 'in', w, '_q0'); }
      else if (R.dir === 'in') { j(R.empty_n, 'in', 1, '_empty_n'); j(R.read, 'out', 1, '_read'); j(R.dout, 'in', w, '_dout'); }
      else { j(R.full_n, 'in', 1, '_full_n'); j(R.write, 'out', 1, '_write'); j(R.din, 'out', w, '_din'); }
    }
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
    map.push(...mine);
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
      // (taken on every valid, forgotten as the next call starts, its start cycle reading only the valid: a valid that comes
      // with ap_done, the usual module's, had been dropped there, the capture a constant XST trimmed with a warning, #2862)
      vhdl.push(`  ${O}_v <= ${O}_o when ${O}_vld = '1' else ${O}_cap;`, `  ${O}_any <= ${O}_vld or (${O}_got and not ${P}_start);`,
        '  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', `      if ap_rst = '1' then`, `        ${O}_got <= '0';`, `      elsif ${O}_vld = '1' then`, `        ${O}_got <= '1';`, `        ${O}_cap <= ${O}_o;`, `      elsif ${P}_start = '1' then`, `        ${O}_got <= '0';`, '      end if;', '    end if;', '  end process;');
      verilog.push(`  assign ${O}_v = ${O}_vld ? ${O}_o : ${O}_cap;`, `  assign ${O}_any = ${O}_vld | (${O}_got & ~${P}_start);`,
        `  always @(posedge ap_clk) if (ap_rst) ${O}_got <= 1'b0; else if (${O}_vld) begin ${O}_got <= 1'b1; ${O}_cap <= ${O}_o; end else if (${P}_start) ${O}_got <= 1'b0;`);
    }
  }
  return { inner, decls, vhdl, verilog };
}
const widthOfOr1 = (p) => widthOf(p) ?? 1;
