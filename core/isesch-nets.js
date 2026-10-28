// Xilinx ISE schematic -> Silinx schematic, the netlist read (#405: out of importIseSch in isesch.js): the project's
// symbol files, the signals and their widths, the blocks as Silinx symbols with their ISE pin positions, the pin
// directions and drivers, the buses (bit and sub-range signals, the slices and joins they need), the Silinx names of
// the signals, and the HDL blocks' specs. importIseSch places and wires what this returns. Isomorphic (no DOM, no
// Node APIs).
import { validIdent } from './schdoc.js';
import { AUTO_RE, blockdefPinPoints, iseXform, lc, libPins, mapSymbol, onSegment, parseIseName, parseIseSym } from './isesch.js';

/** The ISE netlist of a parsed schematic (parseIseSch) read for its import: { sigs, keyWidth, blocks, portPol, helpers, memberOf, mainInfo, claim, keyName, declLines, sheetGeo, sheetPt }. */
export function readIseNets(model, opts, { lang, modules, docName, warn }) {
  // project symbol files (.sym): pin names, directions and positions of non-library symbols
  const symDefs = new Map();
  for (const [k, t] of Object.entries(opts.symbols || {})) {
    try { const d = typeof t === 'string' ? parseIseSym(t) : t; symDefs.set(lc(d.name || String(k).replace(/^.*\//, '').replace(/\.sym$/i, '')), d); } catch (e) { warn(`${k}: ${e.message}`); }
  }

  // ------------------------------------------------------------- signals (keys = lower-case ISE names)
  const sigs = new Map();
  const sig = name => {
    if (name == null) return null;
    const n = String(name).trim();
    if (!n) return null;
    const k = lc(n);
    if (!sigs.has(k)) sigs.set(k, { key: k, name: n, p: parseIseName(n) });
    return k;
  };
  for (const s of model.signals) sig(s.name);
  for (const p of model.ports) sig(p.name);
  for (const b of model.blocks) for (const p of b.pins) if (p.signal) sig(p.signal);
  for (const sh of model.sheets) { for (const b of sh.branches) sig(b.name); for (const io of sh.iomarkers) sig(io.name); }
  const keyWidth = k => sigs.get(k)?.p.width || 1;

  // ------------------------------------------------------------- blocks -> Silinx specs
  const instOf = new Map();
  model.sheets.forEach((sh, si) => sh.instances.forEach(i => instOf.set(lc(i.name), { ...i, sheet: si })));
  // ISE pin positions (sheet units) of a block, from the library tables and the wires that end on the symbol
  const sheetGeo = model.sheets.map(sh => {
    const ends = new Map();  // 'x,y' -> Set(keys)
    const segs = [];
    const add = (x, y, k) => { const q = `${x},${y}`; let s = ends.get(q); if (!s) ends.set(q, s = new Set()); s.add(k); };
    for (const br of sh.branches) { const k = lc(br.name.trim()); for (const w of br.wires) { add(w[0], w[1], k); add(w[2], w[3], k); segs.push({ w, k }); } }
    for (const io of sh.iomarkers) add(io.x, io.y, lc(io.name.trim()));
    return { ends, segs, touches: (x, y, k) => ends.get(`${x},${y}`)?.has(k) || segs.some(s => s.k === k && onSegment(x, y, s.w)) };
  });

  const sheetPt = (inst, x, y) => { const [dx, dy] = iseXform(inst.orien, x, y); return [inst.x + dx, inst.y + dy]; };
  const blocks = [];
  for (const b of model.blocks) {
    const inst = instOf.get(lc(b.name)) || null;
    const def = model.blockdefs.get(lc(b.symbol)) || null;
    // ISE pin positions: library table when the wires confirm it, else the blockdef pin stub the wires end on
    const sd = symDefs.get(lc(b.symbol));
    const lib = libPins(b.symbol) || (sd ? Object.fromEntries(sd.pins.map(q => [q.name, [q.dir, q.x, q.y]])) : null);
    const libAt = n => { const L = lib?.[n] || (lib ? lib[Object.keys(lib).find(k => lc(k) === lc(n))] : null); return L && L[1] != null && L[2] != null ? [L[1], L[2]] : null; };
    const cand = blockdefPinPoints(def);
    const local = new Map(), pt = new Map();
    const claimed = new Set();
    if (inst) {
      const geo = sheetGeo[inst.sheet];
      const touch = (l, key) => { const q = sheetPt(inst, l[0], l[1]); return geo.touches(q[0], q[1], key) ? q : null; };
      const pend = [];
      for (const p of b.pins) {
        const key = p.signal ? lc(p.signal.trim()) : null;
        const L = libAt(p.name);
        if (key && L && touch(L, key)) { local.set(p.name, L); claimed.add(`${L[0]},${L[1]}`); } else pend.push([p, key, L]);
      }
      for (const [p, key, L] of pend) {
        if (key) for (const c of cand) { if (claimed.has(`${c[0]},${c[1]}`)) continue; if (touch(c, key)) { local.set(p.name, c); claimed.add(`${c[0]},${c[1]}`); break; } }
        if (!local.has(p.name) && L) local.set(p.name, L);
      }
      for (const [n, l] of local) pt.set(n, sheetPt(inst, l[0], l[1]));
    }
    const spec = mapSymbol(b, modules, warn, { local, def, sym: sd });
    blocks.push({ blk: b, name: b.name, spec, inst, def, pt });
  }

  // pin directions / drivers
  const driven = new Map();
  const portPol = new Map(model.ports.map(p => [lc(p.name), p.polarity]));
  for (const B of blocks) {
    for (const p of B.blk.pins) {
      const k = p.signal ? lc(p.signal.trim()) : null;
      const pm = B.spec.pins[p.name];
      if (!k || !pm) continue;
      if (pm.dir === 'out' || pm.dir === 'inout') driven.set(k, (driven.get(k) || 0) + 1);
    }
  }
  for (const [k, pol] of portPol) if (/input|bidir/i.test(pol)) driven.set(k, (driven.get(k) || 0) + 1);

  // ------------------------------------------------------------- buses: bit / sub-range signals of a bus
  const ioNames = new Set([...model.ports.map(p => lc(p.name.trim())), ...model.sheets.flatMap(sh => sh.iomarkers.map(i => lc(i.name.trim())))]);
  const groups = new Map();
  for (const s of sigs.values()) if (s.p.range || s.p.bit != null) { const g = lc(s.p.base); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); }
  const helpers = [];          // virtual blocks: slices / bus joins
  const memberOf = new Map();  // member key -> { main, msb, lsb }
  const mainInfo = new Map();  // main key -> { width }
  for (const list of groups.values()) {
    const ranged = list.filter(s => s.p.range).sort((a, b) => b.p.width - a.p.width);
    if (!ranged.length) continue;
    const main = ranged[0];
    const lo = Math.min(main.p.msb, main.p.lsb), hi = Math.max(main.p.msb, main.p.lsb);
    const desc = main.p.msb >= main.p.lsb;
    // (a bus named with its indices, not from 0, D(7:4): it keeps them, its parts' bits too, #1689; an I/O marker's
    // bus and an ascending one are taken from 0)
    const keep = desc && main.p.lsb > 0 && !ioNames.has(main.key);
    const pos = i => (keep ? i : desc ? i - main.p.lsb : main.p.lsb - i);
    const members = [];
    for (const s of list) {
      if (s === main) continue;
      const a = s.p.range ? s.p.msb : s.p.bit, b = s.p.range ? s.p.lsb : s.p.bit;
      if (Math.min(a, b) < lo || Math.max(a, b) > hi) { if (s.p.range) warn(`bus '${s.name}' is not part of '${main.name}': kept as a separate net`); continue; }
      const pa = pos(a), pb = pos(b);
      if (s.p.range && (a >= b) !== desc && a !== b) warn(`bus '${s.name}' has the opposite bit order of '${main.name}': bits are taken in '${main.name}' order`);
      members.push({ s, msb: Math.max(pa, pb), lsb: Math.min(pa, pb) });
    }
    mainInfo.set(main.key, { width: main.p.width, ...(keep ? { msb: main.p.msb, lsb: main.p.lsb } : {}) });
    if (!members.length) continue;
    const mainDriven = driven.has(main.key);
    const drivenMembers = members.filter(m => driven.has(m.s.key));
    let joined = new Set();
    if (!mainDriven && drivenMembers.length) {
      // the bus is assembled from separately driven parts: one bus join
      const chosen = [];
      for (const m of drivenMembers.sort((x, y) => (y.msb - y.lsb) - (x.msb - x.lsb))) {
        if (chosen.some(c => !(m.msb < c.lsb || m.lsb > c.msb))) { warn(`'${m.s.name}' overlaps another driven part of bus '${main.name}' (multiple drivers)`); continue; }
        chosen.push(m);
      }
      chosen.sort((x, y) => y.msb - x.msb);
      const segs = [];
      const bottom = keep ? main.p.lsb : 0;
      let at = keep ? main.p.msb : main.p.width - 1;
      for (const c of chosen) {
        if (c.msb < at) segs.push({ key: null, width: at - c.msb });
        segs.push({ key: c.s.key, width: c.msb - c.lsb + 1 });
        at = c.lsb - 1;
      }
      if (at >= bottom) segs.push({ key: null, width: at - bottom + 1 });
      if (segs.some(s => !s.key)) warn(`bus '${main.name}': bits not driven by any part are tied to 0`);
      helpers.push({ kind: 'join', main: main.key, segs });
      joined = new Set(chosen.map(c => c.s.key));
    } else if (mainDriven && drivenMembers.length) warn(`bus '${main.name}' and its part${drivenMembers.length > 1 ? 's' : ''} ${drivenMembers.map(m => `'${m.s.name}'`).join(', ')} are both driven`);
    for (const m of members) {
      memberOf.set(m.s.key, { main: main.key, msb: m.msb, lsb: m.lsb });
      if (!joined.has(m.s.key)) helpers.push({ kind: 'slice', main: main.key, member: m.s.key, msb: m.msb, lsb: m.lsb, width: main.p.width });
    }
  }

  // ------------------------------------------------------------- names (Silinx identifiers)
  // identifiers of the schematic's language: a VHDL keyword (next, block) kept in a Verilog schematic, and the reverse (#1808)
  const owner = new Map();     // lower-case identifier -> owner tag
  const claim = (want, tag) => {
    let b = String(want || 'n').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'n';
    if (!/^[A-Za-z]/.test(b)) b = 'n' + b;
    let nm = b, k = 0;
    while ((owner.has(lc(nm)) && owner.get(lc(nm)) !== tag) || !validIdent(nm, lang)) nm = `${b}_${++k}`;
    owner.set(lc(nm), tag);
    return nm;
  };
  owner.set(lc(docName), '#doc');
  const keyName = new Map();
  const portNames = new Set();
  // ports first (keep their names), then named signals, bus parts, ISE auto names
  const portKeys = [...new Set([...model.ports.map(p => lc(p.name.trim())), ...model.sheets.flatMap(s => s.iomarkers.map(i => lc(i.name.trim())))])];
  for (const k of portKeys) {
    const s = sigs.get(k);
    const nm = claim(s.p.base, k);
    if (nm !== s.p.base) warn(`I/O marker '${s.name}' renamed '${nm}' (not a valid HDL identifier or name clash)`);
    keyName.set(k, nm); portNames.add(k);
  }
  const order = [...sigs.values()].sort((a, b) => (AUTO_RE.test(a.name) - AUTO_RE.test(b.name)) || ((memberOf.has(a.key) ? 1 : 0) - (memberOf.has(b.key) ? 1 : 0)));
  for (const s of order) {
    if (keyName.has(s.key)) continue;
    const mo = memberOf.get(s.key);
    let want = s.p.base;
    if (mo) want = `${keyName.get(mo.main) || sigs.get(mo.main).p.base}_${mo.msb === mo.lsb ? mo.msb : `${mo.msb}_${mo.lsb}`}`;
    else if (s.p.bit != null) want = `${s.p.base}_${s.p.bit}`;
    else if (s.p.range && !mainInfo.has(s.key)) want = `${s.p.base}_${s.p.msb}_${s.p.lsb}`;
    keyName.set(s.key, claim(want, s.key));
  }
  for (const B of blocks) B.xname = claim(B.name, `#inst:${B.name}`);

  // ------------------------------------------------------------- finalize specs (hdl block pin names, code)
  const declLines = [];
  for (const B of blocks) {
    const sp = B.spec;
    if (sp.type !== 'hdlblock') continue;
    const pinNet = new Map(B.blk.pins.map(p => [p.name, p.signal ? lc(p.signal.trim()) : null]));
    const fin = {};
    const inputs = [], outputs = [];
    for (const [ise, pm] of Object.entries(sp.pins)) {
      const k = pinNet.get(ise);
      // a pin may reuse the name of the net it is wired to; otherwise it needs its own identifier
      const base = parseIseName(ise).base;
      let nm;
      // clock pins take the name of their net: no aliasing assignment, so no delta-cycle skew on the clock
      if (k && (lc(keyName.get(k)) === lc(base) || pm.clock) && !Object.values(fin).some(v => lc(v) === lc(keyName.get(k)))) nm = keyName.get(k);
      else nm = claim(base, `#pin:${B.name}/${ise}`);
      fin[ise] = nm;
      pm.xai = nm;
      const d = { name: nm, width: pm.width || 1 };
      if (pm.clock) d.clock = true;
      if (pm.dir === 'out') outputs.push(d); else inputs.push({ ...d, ...(pm.dir === 'inout' ? { dir: 'inout' } : {}) });
    }
    // remember the ISE symbol so that the export writes it back (library symbol or the project's own symbol)
    sp.params = { title: sp.title || B.blk.symbol, inputs, outputs, iseSymbol: B.blk.symbol, isePins: Object.fromEntries(Object.entries(fin).map(([ise, nm]) => [nm, ise])) };
    if (sp.tpl) {
      const T = suf => claim(`${B.xname}_${suf}`, `#tmp:${B.name}/${suf}`);
      const has = ise => !!pinNet.get(ise);
      const r = sp.tpl(lang, ise => fin[ise] ?? ise, T, has);
      sp.hdl = r.code;
      if (r.decls) declLines.push(...r.decls);
    } else {
      sp.hdl = lang === 'vhdl' ? `-- TODO: ISE symbol '${B.blk.symbol}' has no Silinx equivalent: describe its function here` : `// TODO: ISE symbol '${B.blk.symbol}' has no Silinx equivalent: describe its function here`;
    }
  }
  return { sigs, keyWidth, blocks, portPol, helpers, memberOf, mainInfo, claim, keyName, declLines, sheetGeo, sheetPt };
}
