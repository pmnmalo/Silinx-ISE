// Silinx HLS (#1628): a struct argument or result of the top function one port, as Vitis HLS aggregates it (UG1399,
// Structs in the Interface, the Vivado IP flow): its members packed in their order, the first at the LSB, each the
// size of its C type (bool and char 8 bits, an ap_int<W> rounded up to 8, 16, 32 or 64 bits…, 1-byte alignment), the
// padding bits 0. The module's ports are the struct's; its members' ports (core/c-dataflow.js, core/c-fsmd.js) become
// signals inside it, their slices of the port:
//   read only: the input <name>;
//   written: <name>_i, <name>_o and <name>_o_ap_vld (1 when one of its members is written), each member not written
//   its value read (a sequential module reads them all at the start of a call: core/c-fsmd.js);
//   returned: ap_return.
// A stream of structs is one stream of its words, an array of structs (or a pointer to structs indexed) one memory of
// them (#1668, core/c-agg-mem.js): its members packed the same, the first at the LSB, each its bits (compact=bit, Vitis
// HLS's default for them: a bool 1 bit); a member array's elements one after the other. #pragma HLS AGGREGATE
// compact=bit | byte (each member whole bytes) | none (its C size) | auto (the default) chooses, of a scalar struct too;
// #pragma HLS DISAGGREGATE keeps a port, a stream or a memory per member.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   aggregate(structArgs, params, ports, { seq, rn, how }) ->
//     { ports: the module's, inner: the members' ports as signals, vhdl: [lines], verilog: [lines], groups }
//   structPragmas(fn) -> Map(struct argument -> { disaggregate, compact, loc }), and their warnings
//   wordGroups(structArgs, fn, how) -> [{ name, kind: 'mem' | 'fifo', fields, w, n }]
//   cBits(bits) -> the size of a C integer of that width, in bits

/** The size of a C integer of `bits` bits: whole bytes, a power of 2 of them. */
export function cBits(bits) {
  let b = 8;
  while (b < bits) b *= 2;
  return b;
}

/** The bits a member of `bits` takes in a word, packed compact=bit, byte or none (its C size). */
export const memberBits = (bits, compact = 'none') => (compact === 'bit' ? bits : compact === 'byte' ? Math.ceil(bits / 8) * 8 : cBits(bits));

/** The fields of a struct's port: [{ param, off, w (the member's bits), size (its C size, or compact's) }] and its
 *  width. */
export function layout(members, params, compact = 'none') {
  const fields = [];
  let off = 0;
  for (const m of members) {
    const pa = params.find((p) => p.name === m);
    const t = pa?.type.kind === 'ptr' ? pa.type.to : pa?.type;
    if (!t || t.bits == null) return null;
    fields.push({ param: m, off, w: t.bits, size: memberBits(t.bits, compact) });
    off += memberBits(t.bits, compact);
  }
  return { fields, w: off };
}

const COMPACT = new Set(['bit', 'byte', 'none', 'auto']);
/** The top's pragmas AGGREGATE and DISAGGREGATE (said of a struct by its members, core/c-struct.js: `of` its name):
 *  { how: Map(struct -> { disaggregate, compact, loc }), named: [{ name, pragma, loc }] }. */
export function structPragmas(fn) {
  const how = new Map(), named = [];
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.kind === 'pragma') {
      const p = x.pragma;
      if ((p.name !== 'AGGREGATE' && p.name !== 'DISAGGREGATE') || p.dup) return;
      const name = p.of ?? p.args.variable;
      if (typeof name !== 'string') return;
      const c = String(p.args.compact ?? 'auto').toLowerCase();
      how.set(name, { disaggregate: p.name === 'DISAGGREGATE', compact: COMPACT.has(c) && c !== 'auto' ? c : null, loc: x.loc });
      named.push({ name, pragma: p.name, loc: x.loc });
      return;
    }
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') walk(v);
  };
  walk(fn.body);
  return { how, named };
}

/** The streams and the memories of structs made one (#1668): [{ name, kind: 'fifo' | 'mem', fields: [{ param, off,
 *  w, size, k (its elements in a word) }], w, n (a memory's words) }]; a member not an integer, or the members' sizes
 *  not of the same words: none. (A pointer to structs indexed: a member never used, a pointer, the others' depth.) */
export function wordGroups(structArgs, fn, how = new Map()) {
  const out = [];
  const used = new Set();
  const walk = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(walk); return; } if (x.kind === 'id') used.add(x.name); for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') walk(v); };
  walk(fn.body);
  for (const a of structArgs) {
    if (a.name === 'return' || how.get(a.name)?.disaggregate) continue;
    const ps = a.members.map((m) => fn.params.find((p) => p.name === m));
    if (!ps.length || ps.some((p) => !p)) continue;
    const unused = (p) => a.kind === 'ptr' && p.type.kind === 'ptr' && !used.has(p.name);
    const kind = a.stream && ps.every((p) => p.type.kind === 'stream') ? 'fifo'
      : (a.kind === 'arr' || a.kind === 'ptr') && ps.every((p) => p.type.kind === 'array' || unused(p)) && ps.some((p) => p.type.kind === 'array') ? 'mem' : null;
    if (!kind) continue;
    const compact = how.get(a.name)?.compact || 'bit';
    const fields = [];
    let off = 0, n = null, ok = true;
    ps.forEach((p, i) => {
      const et = p.type.of ?? p.type.to;
      const bits = et?.kind === 'int' ? et.bits : null;
      const k = a.ks?.[i] || 1;
      if (!bits || et.fixed) { ok = false; return; }
      if (kind === 'mem' && p.type.kind === 'array') {
        const len = Number(p.type.length ?? 0);
        if (!len || len % k || (n !== null && n !== len / k)) ok = false;
        n = len / k;
      }
      fields.push({ param: p.name, off, w: bits, size: memberBits(bits, compact), k });
      off += memberBits(bits, compact) * k;
    });
    if (ok) out.push({ name: a.name, kind, fields, w: off, n });
  }
  return out;
}

/** Whether a struct argument is made one port: its members scalars (an array or a stream of structs: wordGroups). */
export const aggregable = (a, params) => !a.stream && a.members.every((m) => {
  const pa = params.find((p) => p.name === m);
  return pa && pa.type.kind !== 'array' && pa.type.kind !== 'stream' && !(pa.type.kind === 'ptr' && pa.type.to.kind === 'array');
});

export function aggregate(structArgs, params, ports, { seq = false, rn = (n) => n, how = new Map() } = {}) {
  const inner = [], vhdl = [], verilog = [], groups = [];
  let outer = ports;
  for (const a of structArgs) {
    if (!aggregable(a, params) || how.get(a.name)?.disaggregate) continue;
    const lay = layout(a.members, params, how.get(a.name)?.compact || 'none');
    const own = ports.filter((p) => a.members.includes(p.param));
    if (!lay || !own.length) continue;
    const ins = own.filter((p) => p.dir === 'in'), outs = own.filter((p) => p.dir === 'out' && p.role === 'arg'), vlds = own.filter((p) => p.role === 'arg_vld');
    const ret = a.name === 'return';
    const name = rn(a.name);
    const pIn = ret ? null : { name: outs.length ? `${name}_i` : name, dir: 'in', w: lay.w, role: 'arg', param: a.name, fields: lay.fields };
    const pOut = !ret && !outs.length ? null
      : { name: ret ? 'ap_return' : `${name}_o`, dir: 'out', w: lay.w, role: ret ? 'return' : 'arg', param: a.name, fields: lay.fields };
    const pVld = pOut && !ret && vlds.length ? { name: `${pOut.name}_ap_vld`, dir: 'out', w: 1, role: 'arg_vld', param: a.name } : null;
    const made = [pIn, pOut, pVld].filter(Boolean);
    // (the struct's ports where its first member's were)
    const at = outer.indexOf(own[0]);
    outer = [...outer.slice(0, at).filter((p) => !own.includes(p)), ...made, ...outer.slice(at).filter((p) => !own.includes(p))];
    // the returned struct's members' _ap_vld: not needed (ap_return is valid with ap_done)
    // (the members' ports signals named ap_s_<port>: none meets the struct's ports, a_i, a member i's a_i too)
    const sn = (p) => `ap_s_${p.name}`;
    inner.push(...own.filter((p) => !(ret && p.role === 'arg_vld')).map((p) => ({ ...p, name: sn(p), from: p.name })));
    groups.push({ name: a.name, ports: made, drop: ret ? vlds.map((p) => p.name) : [], renamed: new Map(own.map((p) => [p.name, sn(p)])) });
    const VS = (p, hi, lo) => (hi === lo ? `${p}(${lo})` : `${p}(${hi} downto ${lo})`);
    const LS = (p, hi, lo) => (hi === lo ? `${p}[${lo}]` : `${p}[${hi}:${lo}]`);
    for (const f of lay.fields) {
      const top = f.off + f.w - 1, pad = f.off + f.size - 1;
      const mi = ins.find((p) => p.param === f.param), mo = outs.find((p) => p.param === f.param), mv = vlds.find((p) => p.param === f.param);
      if (mi) { vhdl.push(`  ${sn(mi)} <= ${VS(pIn.name, top, f.off)};`); verilog.push(`  assign ${sn(mi)} = ${LS(pIn.name, top, f.off)};`); }
      if (!pOut) continue;
      // (a member given back: its value; written now and then (a combinational module), its value when written, else
      // the one read; not written, the one read; the returned struct's not set, 0)
      const keep = (S) => (pIn ? S(pIn.name, top, f.off) : null);
      if (mo && (seq || !mv || ret)) { vhdl.push(`  ${VS(pOut.name, top, f.off)} <= ${sn(mo)};`); verilog.push(`  assign ${LS(pOut.name, top, f.off)} = ${sn(mo)};`); }
      else if (mo) {
        vhdl.push(`  ${VS(pOut.name, top, f.off)} <= ${sn(mo)} when ${sn(mv)} = '1' else ${keep(VS)};`);
        verilog.push(`  assign ${LS(pOut.name, top, f.off)} = ${sn(mv)} ? ${sn(mo)} : ${keep(LS)};`);
      } else if (pIn) { vhdl.push(`  ${VS(pOut.name, top, f.off)} <= ${keep(VS)};`); verilog.push(`  assign ${LS(pOut.name, top, f.off)} = ${keep(LS)};`); }
      else { vhdl.push(`  ${VS(pOut.name, top, f.off)} <= ${f.w === 1 ? "'0'" : '(others => \'0\')'};`); verilog.push(`  assign ${LS(pOut.name, top, f.off)} = ${f.w}'b0;`); }
      if (pad > top) { vhdl.push(`  ${VS(pOut.name, pad, top + 1)} <= ${pad === top + 1 ? "'0'" : '(others => \'0\')'};`); verilog.push(`  assign ${LS(pOut.name, pad, top + 1)} = ${pad - top}'b0;`); }
    }
    if (pVld) {
      vhdl.push(`  ${pVld.name} <= ${vlds.map(sn).join(' or ')};`);
      verilog.push(`  assign ${pVld.name} = ${vlds.map(sn).join(' | ')};`);
    }
  }
  return { ports: outer, inner, vhdl, verilog, groups };
}
