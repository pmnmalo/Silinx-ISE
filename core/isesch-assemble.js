// Xilinx ISE schematic -> Silinx schematic, the assembly (#405: out of importIseSch in isesch.js): the I/O markers
// with no place in the ISE drawing parked beside it, the document built from the placed symbols, wires, net names and
// markers, net names added where ISE connects nets by name only, and the final check against the ISE connectivity
// (its warnings, the nets split or joined, where each ISE block pin ended up). Isomorphic (no DOM, no Node APIs).
import { DOC_VERSION, normalizeDoc, symbolBox, symbolPins, portBox, netlist, joinWires } from './schdoc.js';
import { graphicBox } from './schgraphics.js';
import { AUTO_RE, SIDE_VEC, lc, onSegment, r10 } from './isesch.js';

/** The imported schematic assembled and checked: { doc, warnings, unconnected, pinMap }. ctx: what the placement
 *  made, and the label and port counters (lid, pid) where it left them. */
export function assembleIseImport(ctx) {
  const {
    addWire, declLines, docName, keyName, keyWidth, labelKey, labels, lang, macroBox, macros, mainInfo, model, modules,
    occ, occAdd, occReset, overlapsForeign, parked, passes, pinKey, pinsOf, portKey, ports, segAdd, shiftMacro, sigs,
    stubOf, syms, unplacedPorts, warn, warnings, wireKey, wires, graphics = []
  } = ctx;
  let { lid, pid } = ctx;

  // ------------------------------------------------------------- parking area (no position in the ISE drawing)
  const content = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const acc = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const w of wires) for (const p of w.points) acc(p.x, p.y);
    for (const p of ports) { const b = portBox(p); acc(b.x, b.y); acc(b.x + b.w, b.y + b.h); }
    for (const s of syms) { const b = symbolBox(s, modules); acc(b.x, b.y); acc(b.x + b.w, b.y + b.h); }
    for (const l of labels) acc(l.x, l.y);
    for (const g of graphics) { const b = graphicBox(g); acc(b.x, b.y); acc(b.x + b.w, b.y + b.h); }
    if (x0 === Infinity) return { x0: 40, y0: 40, x1: 40, y1: 40 };
    return { x0, y0, x1, y1 };
  };
  const park = list => {
    if (!list.length) return;
    const c = content();
    const maxW = Math.max(1200, c.x1 - c.x0);
    let x = Math.max(80, c.x0 + 40), y = c.y1 + 100, rowH = 0;
    for (const M of list) {
      const b = macroBox(M);
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      if (x + w + 80 > c.x0 + maxW && x > c.x0 + 40) { x = Math.max(80, c.x0 + 40); y += rowH + 80; rowH = 0; }
      shiftMacro(M, r10(x + 40 - b.x0), r10(y - b.y0));
      x += w + 120; rowH = Math.max(rowH, h);
      M.parked = true;
    }
  };
  park(parked);
  if (unplacedPorts.length) {
    const c = content();
    let y = c.y1 + 80;
    for (const up of unplacedPorts) {
      const k = lc(up.name.trim());
      const p = { id: `P${++pid}`, name: keyName.get(k), dir: /bidir/i.test(up.polarity) ? 'inout' : /output/i.test(up.polarity) ? 'out' : 'in', width: keyWidth(k), x: c.x0 + 120, y };
      ports.push(p); portKey.set(p.id, k); y += 40;
    }
  }

  // ------------------------------------------------------------- assemble, check connectivity, repair
  const labelText = k => (mainInfo.get(k)?.lsb > 0 ? `${keyName.get(k)}(${mainInfo.get(k).msb}:${mainInfo.get(k).lsb})`
    : mainInfo.has(k) || keyWidth(k) > 1 ? `${keyName.get(k)}(${keyWidth(k) - 1}:0)` : keyName.get(k));
  const build = () => {
    for (const l of labels) l.net = labelText(labelKey.get(l.id));
    const d = normalizeDoc({ version: DOC_VERSION, name: docName, lang, sheet: { w: 1700, h: 1100 }, symbols: syms, wires, labels, ports, graphics });
    // each net's wires joined where they branch and at its pins and markers (#678: connected at the ends)
    const ids = new Map(), at = new Map();
    const of = (m, k) => { let v = m.get(k); if (!v) m.set(k, v = []); return v; };
    for (const w of d.wires) if (wireKey.has(w.id)) of(ids, wireKey.get(w.id)).push(w.id);
    for (const sy of d.symbols) for (const p of symbolPins(sy, modules)) if (pinKey.has(`${sy.id}/${p.name}`)) of(at, pinKey.get(`${sy.id}/${p.name}`)).push(p);
    for (const p of d.ports) if (portKey.has(p.id)) of(at, portKey.get(p.id)).push(p);
    pieceOf.clear();
    for (const [k, w] of ids) for (const a of joinWires(d, at.get(k) || [], new Set(w))) pieceOf.set(a.id, pieceOf.get(a.from) || a.from);
    return d;
  };
  // (a wire of the document built split at its joints: its pieces stand for it)
  const pieceOf = new Map(), orig = id => pieceOf.get(id) || id;
  const elemKeys = net => {
    const ks = new Set();
    for (const e of net.endpoints) ks.add(e.kind === 'pin' ? pinKey.get(`${e.sym}/${e.pin}`) : portKey.get(e.port));
    for (const w of net.wires) ks.add(wireKey.get(orig(w)));
    for (const l of net.labels) ks.add(labelKey.get(l));
    ks.delete(undefined);
    return ks;
  };
  const relocated = new Set();
  for (let round = 0; round < 4; round++) {
    const nl = netlist(build(), { modules });
    const bad = nl.nets.filter(n => elemKeys(n).size > 1);
    if (!bad.length) break;
    if (round === 0) {
      // 1. drop the stubs that run into foreign nets (the pins get a net name instead)
      const drop = new Set(bad.flatMap(n => n.wires.map(orig).filter(w => stubOf.has(w))));
      for (let i = wires.length - 1; i >= 0; i--) if (drop.has(wires[i].id)) wires.splice(i, 1);
      continue;
    }
    // 2. move the symbols whose pins touch foreign nets to the parking area
    const symM = new Map(); for (const M of macros) for (const s of M.syms) symM.set(s.id, M);
    const move = [];
    for (const n of bad) for (const e of n.endpoints) if (e.kind === 'pin') { const M = symM.get(e.sym); if (M && !relocated.has(M)) { relocated.add(M); move.push(M); } }
    if (!move.length) break;
    for (let i = wires.length - 1; i >= 0; i--) if (move.includes(stubOf.get(wires[i].id))) wires.splice(i, 1);
    for (const M of move) warn(`${M.syms[0].name}: placed apart from the drawing (its pins overlapped other nets)`);
    park(move);
  }
  // nets of one ISE signal that are not connected geometrically (connection by name in ISE): add net names
  const addNames = () => {
    const bd = build(), nl = netlist(bd, { modules });
    const segOwner = [];
    for (const w of bd.wires) for (let i = 0; i + 1 < w.points.length; i++) segOwner.push({ a: w.points[i], b: w.points[i + 1], net: nl.wireNet.get(w.id) });
    const freeAt = (x, y, net) => !segOwner.some(s => s.net !== net && onSegment(x, y, [s.a.x, s.a.y, s.b.x, s.b.y])) && !ports.some(p => p.x === x && p.y === y && nl.portNet.get(p.id) !== net);
    const pieces = new Map();   // key -> Set(net)
    for (const n of nl.nets) for (const k of elemKeys(n)) { if (k.startsWith('#')) continue; let s = pieces.get(k); if (!s) pieces.set(k, s = new Set()); s.add(n); }
    let added = 0;
    for (const [k, nets] of pieces) {
      const needName = nets.size > 1 || (!AUTO_RE.test(sigs.get(k)?.name || '') && ![...nets].some(n => n.labels.length || n.ports.length)) || ((mainInfo.has(k) || keyWidth(k) > 1) && ![...nets].some(n => n.labels.length || n.ports.length));
      if (!needName) continue;
      for (const n of nets) {
        if (n.labels.some(l => labelKey.get(l) === k) || n.ports.some(p => portKey.get(p) === k)) continue;
        if (nets.size === 1 && (n.labels.length || n.ports.length)) continue;
        let spot = null;
        for (const wId of n.wires) {
          const w = bd.wires.find(q => q.id === wId);
          for (const p of w.points) if (freeAt(p.x, p.y, n)) { spot = [p.x, p.y]; break; }
          if (spot) break;
        }
        if (!spot) {
          // a pin without wires: short stub + name
          const e = n.endpoints.find(q => q.kind === 'pin');
          if (e) {
            const s = syms.find(q => q.id === e.sym);
            const pp = pinsOf(s).find(q => q.name === e.pin);
            const out = SIDE_VEC[pp.side];
            const dirs = [out, [out[1], out[0]], [-out[1], -out[0]], [-out[0], -out[1]]];
            occReset();
            search: for (const [vx, vy] of dirs) for (const len of [20, 30, 40, 50, 60]) {
              const ex = pp.x + vx * len, ey = pp.y + vy * len;
              if (!freeAt(ex, ey, n) || occ.has(`${ex},${ey}`) || passes([pp.x, pp.y], [ex, ey], new Set([`${pp.x},${pp.y}`]), k) || overlapsForeign([pp.x, pp.y], [ex, ey], k)) continue;
              const w = addWire([{ x: pp.x, y: pp.y }, { x: ex, y: ey }], k);
              if (w) { occAdd(ex, ey, k); segAdd(w); spot = [ex, ey]; }
              break search;
            }
            if (!spot && freeAt(pp.x, pp.y, n)) spot = [pp.x, pp.y];
          } else {
            const pe = n.endpoints.find(q => q.kind === 'port');
            if (pe) { const p = ports.find(q => q.id === pe.port); if (freeAt(p.x, p.y, n)) spot = [p.x, p.y]; }
          }
        }
        if (!spot) { warn(`could not attach the net name '${keyName.get(k)}'`); continue; }
        const l = { id: `L${++lid}`, x: spot[0], y: spot[1], net: null };
        labels.push(l); labelKey.set(l.id, k); added++;
      }
    }
    return added;
  };
  addNames();
  addNames();

  // ------------------------------------------------------------- final check against the ISE connectivity
  const doc = build();
  const c = content();
  doc.sheet = { w: Math.max(1700, r10(c.x1 + 120)), h: Math.max(1100, r10(c.y1 + 120)) };
  if (declLines.length) doc.hdl = { lang, decls: declLines.join('\n') };
  const nl = netlist(doc, { modules });
  const unconnected = [];
  const where = new Map();
  for (const n of nl.nets) {
    const ks = elemKeys(n);
    const real = [...ks].filter(k => !k.startsWith('#nc'));
    if (real.length > 1) warn(`connectivity: net '${n.name}' joins ISE nets ${real.filter(k => !k.startsWith('#')).map(k => `'${sigs.get(k)?.name || k}'`).join(', ')}`);
    for (const k of ks) { if (k.startsWith('#')) continue; let s = where.get(k); if (!s) where.set(k, s = new Set()); s.add(n.id); }
  }
  for (const [k, s] of where) if (s.size > 1) { warn(`connectivity: ISE net '${sigs.get(k)?.name || k}' is split in ${s.size} parts`); unconnected.push(sigs.get(k)?.name || k); }
  for (const d of nl.diagnostics) if (d.severity === 'error') warn(`schematic check: ${d.message}`);
  if (model.sheets.length > 1) warn(`the ${model.sheets.length} ISE sheets are placed side by side on one Silinx sheet`);
  doc.importedFrom = { format: 'ise-sch', version: model.version, family: model.attrs.DeviceFamilyName || null };
  // where each ISE block pin ended up ('XLXI_1.I0' -> 'XLXI_1_invI0.I')
  const pinMap = {};
  for (const M of macros) if (M.B) for (const e of M.ext) pinMap[`${M.B.name}.${e.ise}`] = `${e.sym.name}.${e.pin}`;
  return { doc, warnings, unconnected, pinMap };
}
