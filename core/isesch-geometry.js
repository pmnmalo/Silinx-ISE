// Xilinx ISE schematic -> Silinx schematic, the geometry (#405: out of importIseSch in isesch.js): every block's local
// drawing as Silinx symbols (a macro: its symbols, internal wires and the points where its ISE pins end), the virtual
// blocks of the buses and the bus taps, and the order-preserving maps from ISE coordinates to the Silinx grid, one per
// sheet. Isomorphic (no DOM, no Node APIs).
import { defaultParams, symbolPins } from './schdoc.js';
import { AxisMap, INWARD_ROT, S_IN, iseOrienToXai, lc } from './isesch.js';

/** The blocks' macros and the coordinate maps of an ISE schematic's import: { MX, MY, macros, pinKey, pinsOf }. */
export function blockGeometry({ blocks, claim, helpers, keyName, memberOf, model, modules, sheetGeo, warn }) {
  // ------------------------------------------------------------- local geometry of every block (macro)
  let sid = 0;
  const pinKey = new Map();         // 'symId/pin' -> key
  const macros = [];
  const mkSym = (type, name, params, rot = 0, mirror = false, hdl) => {
    const s = { id: `S${++sid}`, type, x: 0, y: 0, rot, mirror, name, params: { ...defaultParams(type), ...params } };
    if (hdl != null) s.hdl = hdl;
    return s;
  };
  const pinsOf = s => symbolPins(s, modules);

  for (const B of blocks) {
    const sp = B.spec;
    const o = B.inst ? iseOrienToXai(B.inst.orien) : { rot: 0, mirror: false };
    const main = mkSym(sp.type, B.xname, sp.params, o.rot, o.mirror, sp.hdl);
    const syms = [main];
    const pins = new Map(pinsOf(main).map(p => [p.name, p]));
    const ext = [];   // { ise, key, E:[x,y], side, sym, pin, invSym? }
    for (const p of B.blk.pins) {
      const pm = sp.pins[p.name];
      const key = p.signal ? lc(p.signal.trim()) : null;
      if (!pm) { if (key) warn(`${B.name} (${B.blk.symbol}): pin ${p.name} has no Silinx equivalent and is left unconnected`); continue; }
      const xp = pins.get(pm.xai);
      if (!xp) { if (key) warn(`${B.name} (${B.blk.symbol}): pin ${p.name} not found on the Silinx symbol`); continue; }
      let E = [xp.x, xp.y], inv = null;
      if (pm.invert) {
        inv = mkSym('inv', `${B.xname}_inv${p.name.replace(/\W/g, '')}`, {}, INWARD_ROT[xp.side]);
        inv.name = claim(inv.name, `#inst:${inv.name}`);
        const ip = pinsOf(inv);
        const O = ip.find(q => q.name === 'O'), I = ip.find(q => q.name === 'I');
        inv.x = xp.x - O.x; inv.y = xp.y - O.y;
        E = [inv.x + I.x, inv.y + I.y];
        syms.push(inv);
        pinKey.set(`${inv.id}/O`, `#int:${B.name}/${p.name}`);
        pinKey.set(`${main.id}/${pm.xai}`, `#int:${B.name}/${p.name}`);
      } else pinKey.set(`${main.id}/${pm.xai}`, key || `#nc:${main.id}/${pm.xai}`);
      if (inv) pinKey.set(`${inv.id}/I`, key || `#nc:${inv.id}/I`);
      const pt = key && B.pt.get(p.name) || null;
      ext.push({ ise: p.name, key, E, side: xp.side, sym: inv || main, pin: inv ? 'I' : pm.xai, pt });
    }
    for (const p of pinsOf(main)) if (!pinKey.has(`${main.id}/${p.name}`)) pinKey.set(`${main.id}/${p.name}`, `#nc:${main.id}/${p.name}`);
    macros.push({ B, syms, ext, inst: B.inst, sheet: B.inst ? B.inst.sheet : -1 });
  }
  // virtual blocks for buses
  let hk = 0;
  for (const H of helpers) {
    const mn = keyName.get(H.main);
    if (H.kind === 'slice') {
      const s = mkSym('slice', claim(`${mn}_tap${++hk}`, `#inst:tap${hk}`), { msb: H.msb, lsb: H.lsb, inWidth: H.width });
      pinKey.set(`${s.id}/I`, H.main); pinKey.set(`${s.id}/O`, H.member);
      macros.push({ helper: H, syms: [s], ext: [], sheet: -1 });
    } else {
      const s = mkSym('busjoin', claim(`${mn}_join`, `#inst:join${++hk}`), { widths: H.segs.map(x => x.width).join(',') });
      H.segs.forEach((g, i) => pinKey.set(`${s.id}/I${i}`, g.key || `#nc:${s.id}/I${i}`));
      pinKey.set(`${s.id}/O`, H.main);
      macros.push({ helper: H, syms: [s], ext: [], sheet: -1 });
    }
  }
  // bus taps -> slices drawn where ISE drew the tap
  model.sheets.forEach((sh, si) => {
    const geo = sheetGeo[si];
    for (const t of sh.bustaps) {
      const at2 = [...(geo.ends.get(`${t.x2},${t.y2}`) || [])];
      const member = at2.find(k => memberOf.has(k));
      if (!member) continue;
      const M = macros.find(m => m.helper?.kind === 'slice' && m.helper.member === member && m.sheet < 0);
      if (!M || !geo.touches(t.x1, t.y1, M.helper.main)) continue;
      const s = M.syms[0];
      const dx = Math.sign(t.x2 - t.x1), dy = Math.sign(t.y2 - t.y1);
      if (dx > 0) { s.rot = 0; s.mirror = false; } else if (dx < 0) { s.rot = 0; s.mirror = true; } else if (dy > 0) { s.rot = 90; s.mirror = false; } else { s.rot = 270; s.mirror = false; }
      const pp = new Map(pinsOf(s).map(p => [p.name, p]));
      M.ext = [
        { ise: 'I', key: M.helper.main, E: [pp.get('I').x, pp.get('I').y], side: pp.get('I').side, sym: s, pin: 'I', pt: [t.x1, t.y1] },
        { ise: 'O', key: member, E: [pp.get('O').x, pp.get('O').y], side: pp.get('O').side, sym: s, pin: 'O', pt: [t.x2, t.y2] },
      ];
      M.sheet = si; M.tap = true;
    }
  });

  // ------------------------------------------------------------- coordinate maps (one per sheet)
  const maps = model.sheets.map(() => ({ X: new AxisMap(S_IN), Y: new AxisMap(S_IN) }));
  model.sheets.forEach((sh, si) => {
    const { X, Y } = maps[si];
    X.add(0); Y.add(0); X.add(sh.width); Y.add(sh.height);
    for (const br of sh.branches) for (const w of br.wires) { X.add(w[0]); X.add(w[2]); Y.add(w[1]); Y.add(w[3]); }
    for (const io of sh.iomarkers) { X.add(io.x); Y.add(io.y); }
    for (const t of sh.bustaps) { X.add(t.x1); X.add(t.x2); Y.add(t.y1); Y.add(t.y2); }
  });
  for (const M of macros) {
    if (M.sheet < 0) continue;
    const { X, Y } = maps[M.sheet];
    const pts = M.ext.filter(e => e.pt);
    for (const e of pts) { X.add(e.pt[0]); Y.add(e.pt[1]); }
    if (M.inst) X.add(M.inst.x), Y.add(M.inst.y);
    // spacing constraints so the Silinx symbol fits between its ISE pin positions
    for (const [ax, A] of [[0, X], [1, Y]]) {
      const byC = new Map();
      for (const e of pts) { const c = e.pt[ax]; let g = byC.get(c); if (!g) byC.set(c, g = []); g.push(e.E[ax]); }
      const cs = [...byC.keys()].sort((a, b) => a - b);
      for (let i = 0; i + 1 < cs.length; i++) {
        const lo = byC.get(cs[i]), hi = byC.get(cs[i + 1]);
        const d = Math.max(...hi) - Math.min(...lo);
        if (Math.min(...hi) > Math.max(...lo) - 1) A.need(cs[i], cs[i + 1], d);
      }
    }
  }
  let xoff = 0;
  maps.forEach(m => { m.X.build(0); m.Y.build(0); m.X.off = xoff - m.X.min + 40; m.Y.off = -m.Y.min + 40; xoff = m.X.off + m.X.max + 200; });
  const MX = (si, x) => maps[si].X.f(x), MY = (si, y) => maps[si].Y.f(y);

  return { MX, MY, macros, pinKey, pinsOf };
}
