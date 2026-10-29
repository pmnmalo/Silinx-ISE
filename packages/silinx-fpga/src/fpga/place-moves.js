// Silinx toolchain - the placer's moves (#405: out of place in core/fpga/place.js): a move proposed (a group of
// slices to another anchor, an I/O to another pad, a block RAM or multiplier to another site, swapping with what is
// there), its change of cost (the nets' bounding boxes kept up to date, the connections' delays), and its commit.
import { BOX_SCAN, bankOfPad } from './place.js';

/** { commit, delta, propose } of place (bb(), bbNorm(), rlim(), tc(), tcNorm(): its current values). */
export function mountMoves(ctx) {
  const {
    dev, N, NC, NN, allowedAtG, anchorX, anchorY, bankAdd, bankOk, bb, bbNorm, box, boxN, cD, cW, cdelay, clashAt,
    connOf, fitsAt, gidx, gridSite, hardOk, hardSites, hardUsed, instConnStart, instNetStart, lambda, movable,
    netCostOf, netOf, netStart, netW, objOf, objs, occ, padFits, padUsed, posX, posY, ri, rlim, scanBox, setAt, setHard,
    sites, tc, tcNorm, vccoOf, setBb, setTc
  } = ctx;

  // a proposed move: the instances that change site (chInst[0 .. chN), to chSite), and what commit
  // needs (mv)
  const maxMembers = Math.max(1, ...objs.map(o => (o.members ? o.members.length : 1)));
  const chInst = new Int32Array(2 * maxMembers + 2);
  const chSite = new Array(2 * maxMembers + 2).fill(null);
  let chN = 0;
  const mv = { kind: '', o: null, other: null, p: null, x: 0, y: 0, nDisp: 0 };
  const newG = new Int32Array(maxMembers), freedG = new Int32Array(maxMembers), dispInst = new Int32Array(maxMembers);
  const padsFor = { in: [...dev.pads.values()], out: [...dev.pads.values()].filter(p => !p.inputOnly) };
  // propose a move into chInst / chSite / mv; false: none
  function propose() {
    const o = movable[ri(movable.length)];
    chN = 0;
    if (o.kind === 'bram' || o.kind === 'mult') {
      // another site of its kind (swapping with the instance there)
      const cands = hardSites[o.kind];
      const p = cands[ri(cands.length)];
      const other = hardUsed[o.kind].get(p.name);
      if (other === o || (other && other.fixed)) return false;
      const cur = sites[o.inst];
      if (!hardOk(o, p, other) || (other && !hardOk(other, cur, o))) return false;
      chInst[chN] = o.inst; chSite[chN++] = p;
      if (other) { chInst[chN] = other.inst; chSite[chN++] = cur; }
      mv.kind = 'hard'; mv.o = o; mv.other = other; mv.p = p;
      return true;
    }
    if (o.kind === 'iob') {
      const cands = padsFor[o.dir === 'in' ? 'in' : 'out'];
      const p = cands[ri(cands.length)];
      const other = padUsed.get(p.name);
      if (other === o) return false;
      if (other && (other.fixed || (other.dir !== 'in' && sites[o.inst].inputOnly))) return false;
      if (!padFits(o.inst, p) && padFits(o.inst, sites[o.inst])) return false;
      if (other && !padFits(other.inst, sites[o.inst]) && padFits(other.inst, p)) return false;
      // (no two registers of one kind on different clocks in a pair, #749)
      const after = q => (q === p ? o : q === sites[o.inst] ? other : padUsed.get(q.name));
      if (clashAt(o.inst, p, after) || (other && clashAt(other.inst, sites[o.inst], after))) return false;
      // both I/Os must suit the VCCO of the bank they go to
      const old = sites[o.inst], vo = vccoOf(o.inst), vt = other ? vccoOf(other.inst) : null;
      bankAdd(old, vo, -1); if (other) bankAdd(p, vt, -1);
      const ok = bankOk(p, vo) && (!other || bankOk(old, vt)) && (bankOfPad(p) !== bankOfPad(old) || vo == null || vt == null || vo === vt);
      bankAdd(old, vo, 1); if (other) bankAdd(p, vt, 1);
      if (!ok) return false;
      chInst[chN] = o.inst; chSite[chN++] = p;
      if (other) { chInst[chN] = other.inst; chSite[chN++] = old; }
      mv.kind = 'iob'; mv.o = o; mv.other = other; mv.p = p;
      return true;
    }
    const ax = anchorX[o.id], ay = anchorY[o.id];
    const r = Math.max(1, Math.round(rlim()));
    const x = ax + ri(2 * r + 1) - r, y = ay + ri(2 * r + 1) - r;
    if ((x === ax && y === ay) || x < 0 || y < 0 || !fitsAt(o, x, y)) return false;
    const mem = o.members, nm = mem.length;
    for (let j = 0; j < nm; j++) newG[j] = gidx(x + mem[j].dx, y + mem[j].dy);
    // the slices it leaves (its old slices not among the new), in member order, and the single
    // slices on its new slices, which step into them
    let nFreed = 0, nDisp = 0;
    for (let j = 0; j < nm; j++) {
      const g = gidx(ax + mem[j].dx, ay + mem[j].dy);
      let inNew = false;
      for (let q = 0; q < nm; q++) if (newG[q] === g) { inNew = true; break; }
      if (!inNew) freedG[nFreed++] = g;
    }
    for (let j = 0; j < nm; j++) {
      const i = occ[newG[j]];
      if (i < 0 || objOf[i] === o.id) continue;
      if (objs[objOf[i]].members.length > 1) return false;   // only single slices step aside
      dispInst[nDisp++] = i;
    }
    for (let j = 0; j < nDisp; j++) if (!allowedAtG(dispInst[j], freedG[j])) return false;
    for (let j = 0; j < nm; j++) { chInst[chN] = mem[j].inst; chSite[chN++] = gridSite[newG[j]]; }
    for (let j = 0; j < nDisp; j++) { chInst[chN] = dispInst[j]; chSite[chN++] = gridSite[freedG[j]]; }
    mv.kind = 'slice'; mv.o = o; mv.x = x; mv.y = y; mv.nDisp = nDisp;
    return true;
  }
  // the cost change of the proposed move: the nets and connections it touches (each once, in the
  // order met), their new costs and delays kept for commit
  const netMark = new Int32Array(NN), connMark = new Int32Array(NC);
  let mark = 0;
  const tNets = new Int32Array(NN), tNetCost = new Float64Array(NN), netQ = new Int32Array(NN);
  const tBox = new Float64Array(4 * NN), tBoxN = new Int32Array(4 * NN);
  const tConns = new Int32Array(NC), tConnDelay = new Float64Array(NC);
  let nT = 0, nTC = 0, dbbL = 0, dtcL = 0;
  const saveX = new Float64Array(chInst.length), saveY = new Float64Array(chInst.length);
  // the moved pins of each touched net: a list per net (head[q], then next[]) of change indexes
  let maxNets = 1;
  for (let i = 0; i < N; i++) maxNets = Math.max(maxNets, instNetStart[i + 1] - instNetStart[i]);
  const head = new Int32Array(NN), lnkC = new Int32Array(chInst.length * maxNets), lnkNext = new Int32Array(chInst.length * maxNets);
  // one side (x: o = 0, y: o = 2) of the box of touched net q after its moved pins leave their old
  // positions (saved) for their new ones (pos), from its box before (box[b]), into tBox[4q + o]:
  // false when an edge loses all its pins (the pins must be scanned again)
  const moveSide = (q, b, o, P, S) => {
    let lo = box[b + o], hi = box[b + o + 1], nlo = boxN[b + o], nhi = boxN[b + o + 1];
    for (let l = head[q]; l >= 0; l = lnkNext[l]) { const v = S[lnkC[l]]; if (v === lo) nlo--; if (v === hi) nhi--; }
    for (let l = head[q]; l >= 0; l = lnkNext[l]) {
      const v = P[chInst[lnkC[l]]];
      if (v < lo) { lo = v; nlo = 1; } else if (v === lo) nlo++;
      if (v > hi) { hi = v; nhi = 1; } else if (v === hi) nhi++;
    }
    if (nlo <= 0 || nhi <= 0) return false;
    const w = 4 * q + o;
    tBox[w] = lo; tBox[w + 1] = hi; tBoxN[w] = nlo; tBoxN[w + 1] = nhi;
    return true;
  };
  function delta() {
    mark++;
    nT = 0; nTC = 0;
    let nl = 0;
    for (let c = 0; c < chN; c++) {
      const i = chInst[c];
      for (let q = instNetStart[i], e = instNetStart[i + 1]; q < e; q++) {
        const k = netOf[q];
        if (netMark[k] !== mark) { netMark[k] = mark; netQ[k] = nT; head[nT] = -1; tNets[nT++] = k; }
        const qk = netQ[k];
        lnkC[nl] = c; lnkNext[nl] = head[qk]; head[qk] = nl++;
      }
      if (lambda) for (let q = instConnStart[i], e = instConnStart[i + 1]; q < e; q++) { const j = connOf[q]; if (connMark[j] !== mark) { connMark[j] = mark; tConns[nTC++] = j; } }
    }
    for (let c = 0; c < chN; c++) { const i = chInst[c]; saveX[c] = posX[i]; saveY[c] = posY[i]; posX[i] = chSite[c].px; posY[i] = chSite[c].py; }
    let dbb = 0, dtc = 0;
    for (let q = 0; q < nT; q++) {
      const k = tNets[q], o = 4 * q;
      let c;
      // a larger net: its box from the old one and its moved pins, unless an edge loses all its
      // pins (a small net: scanned, as fast)
      if (netStart[k + 1] - netStart[k] > BOX_SCAN && moveSide(q, 4 * k, 0, posX, saveX) && moveSide(q, 4 * k, 2, posY, saveY)) c = netW[k] * ((tBox[o + 1] - tBox[o]) + (tBox[o + 3] - tBox[o + 2]));
      else c = scanBox(k, tBox, tBoxN, o);
      tNetCost[q] = c; dbb += c - netCostOf[k];
    }
    for (let q = 0; q < nTC; q++) { const j = tConns[q], d = cdelay(j); tConnDelay[q] = d; dtc += cW[j] * (d - cD[j]); }
    for (let c = 0; c < chN; c++) { const i = chInst[c]; posX[i] = saveX[c]; posY[i] = saveY[c]; }
    dbbL = dbb; dtcL = dtc;
    return (1 - lambda) * dbb / bbNorm() + lambda * dtc / tcNorm();
  }
  function commit() {
    if (mv.kind === 'hard') {
      const { o, other, p } = mv;
      const old = sites[o.inst];
      if (other) { hardUsed[o.kind].delete(p.name); setHard(o, p); setHard(other, old); posX[other.inst] = old.px; posY[other.inst] = old.py; } else setHard(o, p);
      posX[o.inst] = p.px; posY[o.inst] = p.py;
    } else if (mv.kind === 'iob') {
      const { o, other, p } = mv;
      const old = sites[o.inst];
      const vo = vccoOf(o.inst), vt = other ? vccoOf(other.inst) : null;
      bankAdd(old, vo, -1); bankAdd(p, vo, 1);
      if (other) { bankAdd(p, vt, -1); bankAdd(old, vt, 1); }
      padUsed.delete(old.name);
      if (other) { padUsed.set(old.name, other); sites[other.inst] = old; posX[other.inst] = old.px; posY[other.inst] = old.py; }
      padUsed.set(p.name, o); sites[o.inst] = p; posX[o.inst] = p.px; posY[o.inst] = p.py;
    } else {
      const { o, x, y, nDisp } = mv;
      const ax = anchorX[o.id], ay = anchorY[o.id];
      for (const m of o.members) occ[gidx(ax + m.dx, ay + m.dy)] = -1;
      for (let j = 0; j < nDisp; j++) {
        const i = dispInst[j], g = freedG[j], s = gridSite[g];
        occ[g] = i; sites[i] = s; posX[i] = s.px; posY[i] = s.py;
        anchorX[objOf[i]] = s.x; anchorY[objOf[i]] = s.y;
      }
      setAt(o, x, y);
      for (const m of o.members) { posX[m.inst] = sites[m.inst].px; posY[m.inst] = sites[m.inst].py; }
    }
    for (let q = 0; q < nT; q++) {
      const k = tNets[q];
      netCostOf[k] = tNetCost[q];
      for (let e = 0; e < 4; e++) { box[4 * k + e] = tBox[4 * q + e]; boxN[4 * k + e] = tBoxN[4 * q + e]; }
    }
    for (let q = 0; q < nTC; q++) cD[tConns[q]] = tConnDelay[q];
    setBb(bb() + dbbL);
    setTc(tc() + dtcL);
  }

  return { commit, delta, propose };
}
