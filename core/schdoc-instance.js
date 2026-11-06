// Silinx - a schematic made from HDL, a module instance drawn as a module symbol (#405: out of schematicFromHdl in
// schdoc-from-hdl.js): its pins wired to the module's nets, constants and gates of the expressions it is connected to;
// an instance that cannot be drawn so stays an HDL block (schematicFromHdl). Isomorphic ES module: no DOM and no Node
// APIs.
import { blockMarkOf } from './schdoc-hdl.js';
import { constBits, findMod, prVhdl, prVlog, unparen } from './schdoc.js';
import { bitsValue } from './schdoc-from-hdl.js';

/** { drawInstance } of schematicFromHdl: drawInstance(it, rw) draws an instance item, false when it cannot. */
export function mountInstanceDrawing(ctx) {
  const {
    W, addSym, anonNet, archText, ci, connect, exprToGates, materialise, modsN, moduleLevel, nk, sigOfRef, sp, srcOf
  } = ctx;

  // 2. module instance -> module symbol
  function drawInstance(it, rw) {
    if (!(it.kind === 'instance' && rw.children.length === 1 && !rw.children[0].blackbox)) return false;
    const c = rw.children[0];
    const info = c.connInfo || [];
    const plan = [];
    const pinsOK = [];
    let ok = true;
    for (const ci2 of info) {
      const conn = (() => {
        const k = it.conns.findIndex(x => x.port != null && nk(x.port) === nk(ci2.port));
        if (k >= 0) return it.conns[k];
        const pos = info.indexOf(ci2);
        const posConn = it.conns.filter(x => x.port == null);
        return posConn.length ? posConn[pos] : null;
      })();
      const expr = conn ? conn.expr : null;
      const pw = ci2.t?.w ?? 1;
      if (!expr) { pinsOK.push({ port: ci2.port, none: true }); continue; }
      const ref = sigOfRef(expr);
      if (ref && moduleLevel(ref) && W(ref) === pw) { pinsOK.push({ port: ci2.port, net: ref.name, w: pw, out: ci2.dir === 'out' || ci2.dir === 'inout' }); continue; }
      if (ci2.dir === 'in' && (expr.op === 'lit' || expr.op === 'int')) {
        const bits = expr.op === 'lit' ? expr.bits : constBits(expr.value, pw);
        pinsOK.push({ port: ci2.port, constBits: bits.length === pw ? bits : constBits(`0b${bits}`, pw), w: pw }); continue;
      }
      if (ci2.dir === 'in') {
        const g = exprToGates(expr, plan);
        if (g && g.w === pw && !g.net) { pinsOK.push({ port: ci2.port, gate: g, w: pw }); continue; }
        if (g && g.net && g.w === pw) { pinsOK.push({ port: ci2.port, net: g.net, w: pw }); continue; }
      }
      ok = false; break;
    }
    if (ok) {
      const generics = {};
      it.params.forEach((pp, k) => {
        if (!pp.value) return;
        let nm = pp.name;
        if (nm == null) { const nl2 = (c.mod?.params || []).filter(x => !x.local); nm = nl2[k]?.name; }
        if (nm) generics[nm] = unparen(ci ? prVhdl(pp.value) : prVlog(pp.value));
      });
      // the module, its pins and generics named as the modules name them (VHDL: case-insensitive)
      const cm = c.mod?.lang === 'vhdl' ? findMod(modsN, c.module) : null;
      const asIn = (list, n) => (cm && list?.find(x => x.name.toLowerCase() === String(n).toLowerCase())?.name) || n;
      for (const g of Object.keys(generics)) { const g2 = asIn(cm?.generics, g); if (g2 !== g) { generics[g2] = generics[g]; delete generics[g]; } }
      // a block of a schematic (its own entity, marked silinx-symbol, #175): the symbol it was drawn as
      const mark = blockMarkOf(srcOf(c.mod?.file) ?? archText, c.mod?.name || c.module);
      const s = mark ? addSym(mark.type, mark.params, sp(c.name))
        : addSym('module', { module: cm?.name || c.module, generics, ports: info.map(x => ({ name: asIn(cm?.ports, x.port), dir: x.dir, width: x.t?.w ?? 1 })) }, sp(c.name));
      const built = [];
      for (const q of pinsOK) {
        if (q.none) continue;
        const ep = { sym: s.id, pin: asIn(cm?.ports, q.port) };
        if (q.net) connect(q.net, q.w, ep, q.out);
        else if (q.constBits) {
          const k = addSym('constant', { value: bitsValue(q.constBits), width: q.w });
          const n = anonNet(q.w); connect(n, q.w, { sym: k.id, pin: 'O' }, true); connect(n, q.w, ep);
        } else if (q.gate) {
          const r = materialise(q.gate, plan, built);
          const n = anonNet(q.w); connect(n, q.w, { sym: r.sym.id, pin: r.pin }, true); connect(n, q.w, ep);
        }
      }
      return true;
    }
    return false;
  }

  return { drawInstance };
}
