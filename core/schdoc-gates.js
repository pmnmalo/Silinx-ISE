// Silinx - a schematic made from HDL, the gate conversion (#405: out of schematicFromHdl in schdoc-from-hdl.js): an
// expression of one-bit or bus signals turned into a plan of gates, inverters, multiplexers and constants (with
// tri-state parts), then the plan's symbols placed on the sheet and wired by net; what has no gate becomes an HDL
// block. Isomorphic ES module: no DOM and no Node APIs.
import { SYMBOLS } from './schdoc.js';
import { vhdlClass } from './schdoc-hdl.js';
import { bitsValue } from './schdoc-from-hdl.js';

/** { clsOfSig, exprToGates, materialise, sigOfRef, triParts } of schematicFromHdl. */
export function mountGateConversion(ctx) {
  const {
    W, addSym, anonNet, ci, connect, moduleLevel, nk, sigByName, typeText
  } = ctx;

  // ---- type classes for gate conversion
  const clsOfSig = s => {
    if (!ci) return s.t.s ? 'vs' : 'v';
    const t = typeText.get(nk(s.name));
    return t ? vhdlClass(t) : 'other';
  };
  const sigOfRef = e => (e && e.op === 'ref' ? sigByName.get(nk(e.name)) : null);
  const constIdx = e => (e && e.op === 'int' ? +e.value : null);
  // try to express an expression as gates; returns { net } (existing net name) / { sym, pin, w, cls } / null
  function exprToGates(e, plan) {
    if (!e) return null;
    const ref = sigOfRef(e);
    if (ref) { if (!moduleLevel(ref)) return null; const cls = clsOfSig(ref); if (cls === 'other' || cls === 'u' || cls === 's' || cls === 'vs') return null; return { net: ref.name, w: W(ref), cls }; }
    // bit / slice selection of a whole signal with constant indices
    if ((e.op === 'index' || (e.op === 'apply' && e.args.length === 1 && !e.args[0].named)) || e.op === 'slice') {
      const base = e.op === 'apply' ? sigByName.get(nk(e.name)) : sigOfRef(e.base);
      if (!base || !moduleLevel(base)) return null;
      const bc = clsOfSig(base);
      if (!(bc === 'slv' || bc === 'v')) return null;
      let msb, lsb;
      if (e.op === 'slice') { msb = constIdx(e.left); lsb = constIdx(e.right); }
      else { msb = lsb = constIdx(e.op === 'apply' ? e.args[0] : e.index); }
      // (a slice of an ascending vector, c(1 to 2), stays HDL: a bus tap takes its bits MSB downto LSB, #1691, #2903)
      if (msb == null || lsb == null || msb < lsb) return null;
      const w = Math.abs(msb - lsb) + 1;
      plan.push(() => {
        const s = addSym('slice', { msb, lsb });
        connect(base.name, W(base), { sym: s.id, pin: 'I' });
        return s;
      });
      return { pending: plan.length - 1, pin: 'O', w, cls: ci ? (e.op === 'slice' ? 'slv' : 'sl') : 'v' };
    }
    if (e.op === 'lit' && (e.sized !== false || ci)) {
      const w = e.bits.length;
      plan.push(() => addSym('constant', { value: bitsValue(e.bits), width: w }));
      return { pending: plan.length - 1, pin: 'O', w, cls: ci ? (e.scalar ? 'sl' : 'slv') : 'v', lit: true };
    }
    const gate = (type, args, outW, outCls, pins) => {
      plan.push(() => addSym(type, { width: outW }));
      const idx = plan.length - 1;
      return { pending: idx, pin: 'O', w: outW, cls: outCls, args, pins };
    };
    if (e.op === 'unary' && e.o === '~' && !(e.a.op === 'binary' && ['&', '|', '^'].includes(e.a.o))) {
      const a = exprToGates(e.a, plan); if (!a || a.lit) return null;
      return gate('inv', [[a, 'I']], a.w, a.cls);
    }
    let inverted = false;
    if (e.op === 'unary' && e.o === '~' && e.a.op === 'binary' && ['&', '|', '^'].includes(e.a.o)) { inverted = true; e = e.a; }
    if (e.op === 'binary' && ['&', '|', '^', '~^', 'nand', 'nor'].includes(e.o)) {
      // flatten associative chains (left to right, without recursing: a chain of thousands, #3559)
      const flat = [];
      if (['&', '|', '^'].includes(e.o)) {
        for (const todo = [e]; todo.length;) {
          const x = todo.pop();
          if (x.op === 'binary' && x.o === e.o && flat.length < 16) todo.push(x.b, x.a); else flat.push(x);
        }
      } else flat.push(e.a, e.b);
      // (a NAND / NOR / XNOR: one gate, at most 4 / 2 inputs; an AND / OR / XOR of more: a tree of gates, #171)
      const maxN = inverted ? ({ '&': 4, '|': 4, '^': 2 }[e.o]) : ({ '&': 16, '|': 16, '^': 16 }[e.o] || 2);
      if (flat.length > maxN) return null;
      // operands '~signal' of an AND/OR become the inverted inputs of an ANDnBk/ORnBk (NANDnBk/NORnBk) gate
      const simpleNot = x => x.op === 'unary' && x.o === '~' && ['ref', 'index', 'slice', 'apply'].includes(x.a.op);
      const nInv = ['&', '|'].includes(e.o) ? flat.filter(simpleNot).length : 0;
      if (nInv && flat.length > 1 && flat.length <= 4) {
        const op0 = inverted ? { '&': 'nand', '|': 'nor' }[e.o] : { '&': 'and', '|': 'or' }[e.o];
        const type = `${op0}${flat.length}b${nInv}`;
        if (SYMBOLS[type]) {
          const ord = [...flat.filter(simpleNot).map(x => x.a), ...flat.filter(x => !simpleNot(x))];
          const args = ord.map(x => exprToGates(x, plan));
          if (args.every(Boolean) && !args.some((a, k) => k < nInv && a.lit)) {
            const w = args[0].w, cls = args.find(a => !a.lit)?.cls || args[0].cls;
            const okT = args.every(a => a.w === w && (a.cls === cls || (a.lit && ((cls === 'sl' && a.cls === 'sl') || (cls !== 'sl' && a.cls !== 'sl')))));
            if (okT && !args.every(a => a.lit)) return gate(type, args.map((a, k) => [a, `I${k}`]), w, cls);
          }
          return null;
        }
      }
      const args = flat.map(x => exprToGates(x, plan));
      if (args.some(a => !a)) return null;
      const w = args[0].w, cls = args.find(a => !a.lit)?.cls || args[0].cls;
      if (args.some(a => a.w !== w || (a.cls !== cls && !(a.lit && ((cls === 'sl' && a.cls === 'sl') || (cls !== 'sl' && a.cls !== 'sl')))))) return null;
      if (args.every(a => a.lit)) return null;
      const op = inverted ? { '&': 'nand', '|': 'nor', '^': 'xnor' }[e.o] : { '&': 'and', '|': 'or', '^': 'xor', '~^': 'xnor', nand: 'nand', nor: 'nor' }[e.o];
      if ((args.length <= 4 && SYMBOLS[`${op}${args.length}`] && !SYMBOLS[`${op}${args.length}`].hidden) || !SYMBOLS[`${op}2`]) return SYMBOLS[`${op}${args.length}`] ? gate(`${op}${args.length}`, args.map((a, k) => [a, `I${k}`]), w, cls) : null;
      // more than 4 operands (#171: gates of at most 4 inputs): AND / OR / XOR as a tree of them, the
      // inverted ones (NAND, NOR) left to an HDL block
      if (!['and', 'or', 'xor'].includes(op)) return null;
      const K = SYMBOLS[`${op}4`] ? 4 : 2;   // (XOR: 2 inputs a gate)
      const tree = list => (list.length <= K ? gate(`${op}${list.length}`, list.map((a, k) => [a, `I${k}`]), w, cls)
        : tree(Array.from({ length: Math.ceil(list.length / K) }, (_, i) => list.slice(K * i, K * i + K)).map(g => (g.length === 1 ? g[0] : gate(`${op}${g.length}`, g.map((a, k) => [a, `I${k}`]), w, cls)))));
      return tree(args);
    }
    if (e.op === 'cond') {
      // Verilog s ? a : b ; VHDL a when s = '1' else b
      let sel = null, a = e.then, b = e.else;
      if (!ci) sel = e.cond;
      else if (e.cond.op === 'binary' && e.cond.o === '==' && e.cond.b?.op === 'lit' && e.cond.b.scalar) {
        sel = e.cond.a;
        if (e.cond.b.bits === '0') [a, b] = [b, a]; else if (e.cond.b.bits !== '1') return null;
      }
      if (!sel) return null;
      const sv = exprToGates(sel, plan);
      if (!sv || sv.w !== 1 || sv.lit || (ci && sv.cls !== 'sl')) return null;
      const A = exprToGates(a, plan), B = exprToGates(b, plan);
      if (!A || !B || A.w !== B.w || (A.cls !== B.cls && !(A.lit || B.lit))) return null;
      return gate('mux2', [[B, 'D0'], [A, 'D1'], [sv, 'S0']], A.w, A.lit ? B.cls : A.cls);
    }
    if (e.op === 'concat' && e.parts.length <= 8) {
      const args = e.parts.map(x => exprToGates(x, plan));
      if (args.some(a => !a)) return null;
      if (ci && args.some(a => a.cls !== 'sl' && a.cls !== 'slv')) return null;
      const w = args.reduce((s, a) => s + a.w, 0);
      plan.push(() => addSym('busjoin', { widths: args.map(a => a.w).join(',') }));
      return { pending: plan.length - 1, pin: 'O', w, cls: ci ? 'slv' : 'v', args: args.map((a, k) => [a, `I${k}`]) };
    }
    return null;
  }
  // a tri-state driver: { sel, data, low } (low = the buffer drives while sel is 0) or null
  const isZ = x => !!x && ((x.op === 'lit' && /^z+$/i.test(x.bits)) || (x.op === 'repl' && isZ(x.value))
    || (x.op === 'aggregate' && x.items?.length === 1 && x.items[0].choices?.length === 1 && x.items[0].choices[0] === 'others' && isZ(x.items[0].value)));
  function triParts(e) {
    if (!e || e.op !== 'cond') return null;
    let sel, hi = true;
    if (!ci) sel = e.cond;
    else if (e.cond.op === 'binary' && e.cond.o === '==' && e.cond.b?.op === 'lit' && e.cond.b.scalar && /^[01]$/.test(e.cond.b.bits)) { sel = e.cond.a; hi = e.cond.b.bits === '1'; }
    else return null;
    if (isZ(e.else) && !isZ(e.then)) return { sel, data: e.then, low: !hi };
    if (isZ(e.then) && !isZ(e.else)) return { sel, data: e.else, low: hi };
    return null;
  }
  // materialise a planned gate tree: returns { net } handled by caller
  function materialise(node, plan, built) {
    if (node.net) return { netName: node.net, w: node.w };
    const s = built[node.pending] || (built[node.pending] = plan[node.pending]());
    for (const [arg, pin] of node.args || []) {
      const src = materialise(arg, plan, built);
      if (src.netName) connect(src.netName, src.w, { sym: s.id, pin });
      else { const n = anonNet(arg.w); connect(n, arg.w, { sym: src.sym.id, pin: src.pin }, true); connect(n, arg.w, { sym: s.id, pin }); }
    }
    return { sym: s, pin: node.pin, w: node.w };
  }

  return { clsOfSig, exprToGates, materialise, sigOfRef, triParts };
}
