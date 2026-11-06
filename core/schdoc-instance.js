// Silinx - a schematic made from HDL, a module instance drawn as a module symbol (#405: out of schematicFromHdl in
// schdoc-from-hdl.js): its pins wired to the module's nets, constants and gates of the expressions it is connected to;
// an instance that cannot be drawn so stays an HDL block (schematicFromHdl). A vector whose bits the outputs of
// instances drive, a bit or a slice each (#2901: FA0: full_adder port map (..., s => s(0)), ...), is drawn as its
// bits' nets, named as ISE names a bus's bits (c(0), c[3:2], #1688); a port's, as a bus join of them to its marker.
// Isomorphic ES module: no DOM and no Node APIs.
import { blockMarkOf } from './schdoc-hdl.js';
import { constBits, findMod, prVhdl, prVlog, unparen } from './schdoc.js';
import { bitsValue } from './schdoc-from-hdl.js';

/** { drawInstance, drawJoins } of schematicFromHdl: drawInstance(it, rw) draws an instance item, false when it cannot;
 *  drawJoins() then joins the bits the instances drive of a port. */
export function mountInstanceDrawing(ctx) {
  const {
    W, addSym, anonNet, archText, ci, clsOfSig, connect, exprToGates, isPort, items, materialise, modsN, moduleLevel, nk,
    rwOf, sigOfRef, sp, srcOf
  } = ctx;

  // a bit or a slice, constant indices, of a module-level vector: { sig, w, pos, name } (pos: its left end's distance
  // from the vector's left end; name: its net's, s(0), s(3:2), s[0])
  const constIdx = e => (e && e.op === 'int' ? +e.value : null);
  function partOf(e) {
    let base, msb, lsb;
    if (e.op === 'slice') { base = sigOfRef(e.base); msb = constIdx(e.left); lsb = constIdx(e.right); }
    else if (e.op === 'index') { base = sigOfRef(e.base); msb = lsb = constIdx(e.index); }
    else if (e.op === 'apply' && e.args?.length === 1 && !e.args[0].named) { base = sigOfRef({ op: 'ref', name: e.name }); msb = lsb = constIdx(e.args[0]); }
    else return null;
    const t = base?.t;
    if (!base || !moduleLevel(base) || msb == null || lsb == null || t?.left == null || t?.right == null) return null;
    if (!['slv', 'v'].includes(clsOfSig(base)) || (t.desc ? msb < lsb : msb > lsb)) return null;
    const [lo, hi] = [Math.min(t.left, t.right), Math.max(t.left, t.right)];
    if (Math.min(msb, lsb) < lo || Math.max(msb, lsb) > hi) return null;
    const bits = msb === lsb ? `${msb}` : `${msb}:${lsb}`;
    return { sig: base, w: Math.abs(msb - lsb) + 1, pos: Math.abs(msb - t.left), name: ci ? `${sp(base.name)}(${bits})` : `${sp(base.name)}[${bits}]` };
  }

  // an instance's pins: { c, info, plan, pinsOK } when it can be drawn (a part of a vector of joinable only), or null
  function planInstance(it, rw, joinable) {
    if (!(it.kind === 'instance' && rw.children.length === 1 && !rw.children[0].blackbox)) return null;
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
        const part = partOf(expr);
        if (part && part.w === pw && joinable.has(part.sig)) { pinsOK.push({ port: ci2.port, net: part.name, w: pw, part: true }); continue; }
        const g = exprToGates(expr, plan);
        if (g && g.w === pw && !g.net) { pinsOK.push({ port: ci2.port, gate: g, w: pw }); continue; }
        if (g && g.net && g.w === pw) { pinsOK.push({ port: ci2.port, net: g.net, w: pw }); continue; }
      }
      if (ci2.dir === 'out') {
        const part = partOf(expr);
        if (part && part.w === pw && joinable.has(part.sig)) {
          pinsOK.push(isPort(part.sig) ? { port: ci2.port, w: pw, join: part } : { port: ci2.port, net: part.name, w: pw, out: true, part });
          continue;
        }
      }
      ok = false; break;
    }
    return ok ? { c, info, plan, pinsOK } : null;
  }

  // the vectors driven part by part by instances' outputs that are drawn so: every item that writes one is an instance
  // that can be drawn, and their parts cover it, each bit once; a port read by none (else they stay HDL blocks, #1715)
  const instances = (items || []).filter(it => it.kind === 'instance' && rwOf(it)).map(it => ({ it, rw: rwOf(it) }));
  const writers = sig => (items || []).filter(it => rwOf(it)?.writes.has(sig));
  const partsOf = (plans, sig) => plans.flatMap(p => p.pinsOK.map(q => (q.out ? q.part : q.join)).filter(x => x?.sig === sig));
  // the items that read a signal (an instance: by an input, its outputs' parts not a read)
  const names = (e, sig) => !!e && typeof e === 'object' && ((['ref', 'apply'].includes(e.op) && nk(e.name) === nk(sig.name))
    || Object.values(e).some(v => (Array.isArray(v) ? v.some(x => names(x, sig)) : typeof v === 'object' && names(v, sig))));
  const inputsOf = it => (rwOf(it).children[0]?.connInfo || []).filter(x => x.dir !== 'out')
    .map(x => it.conns.find(k => k.port != null && nk(k.port) === nk(x.port))?.expr);
  const readers = sig => (items || []).filter(it => rwOf(it)?.reads.has(sig)
    && (it.kind !== 'instance' || it.conns.some(k => k.port == null) || inputsOf(it).some(e => names(e, sig))));
  // (an internal vector read by instances only, each by its parts: no bus tap of a net of its own, which would have
  // no width, nor its bits counted from 0, c(3 downto 1))
  const readByParts = sig => readers(sig).every(it => it.kind === 'instance' && inputsOf(it).every(e => !names(e, sig) || partOf(e)?.sig === sig));
  const joinable = new Set();
  for (const { it, rw } of instances) for (const ci2 of rw.children[0]?.connInfo || []) {
    const conn = it.conns.find(x => x.port != null && nk(x.port) === nk(ci2.port));
    const part = ci2.dir === 'out' && conn?.expr ? partOf(conn.expr) : null;
    if (part && (isPort(part.sig) ? !readers(part.sig).length : readByParts(part.sig))) joinable.add(part.sig);
  }
  for (let changed = joinable.size > 0; changed;) {
    changed = false;
    const planned = new Map(instances.map(({ it, rw }) => [it, planInstance(it, rw, joinable)]));
    for (const sig of [...joinable]) {
      const ws = writers(sig);
      const parts = ws.every(it => planned.get(it)) ? partsOf(ws.map(it => planned.get(it)), sig).sort((a, b) => a.pos - b.pos) : null;
      const covers = parts && parts.every((p, k) => p.pos === (k ? parts[k - 1].pos + parts[k - 1].w : 0)) && parts.reduce((s, p) => s + p.w, 0) === W(sig);
      // (an internal vector's readers drawn too: an instance not drawn would read its net whole)
      const read = isPort(sig) || readers(sig).every(it => planned.get(it));
      if (!covers || !read) { joinable.delete(sig); changed = true; }
    }
  }

  const joins = new Map([...joinable].filter(isPort).map(sig => [sig, []]));   // a port -> its parts drawn: { pos, w, net }

  // 2. module instance -> module symbol
  function drawInstance(it, rw) {
    const planned = planInstance(it, rw, joinable);
    if (planned) {
      const { c, info, plan, pinsOK } = planned;
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
        if (q.net) { const n = connect(q.net, q.w, ep, q.out); if (q.part) n.part = true; }
        else if (q.join) { const n = anonNet(q.w); connect(n, q.w, ep, true); joins.get(q.join.sig).push({ pos: q.join.pos, w: q.w, net: n }); }
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

  // the bus joins of the ports the instances drive part by part, I0 the port's left end (#2901)
  function drawJoins() {
    for (const [sig, parts] of joins) {
      parts.sort((a, b) => a.pos - b.pos);
      const s = addSym('busjoin', { widths: parts.map(p => p.w).join(',') });
      parts.forEach((p, k) => connect(p.net, p.w, { sym: s.id, pin: `I${k}` }));
      connect(sig.name, W(sig), { sym: s.id, pin: 'O' }, true);
    }
  }

  return { drawInstance, drawJoins };
}
