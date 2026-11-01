// The ASM chart editor's drawing of its chart (#405: out of mountAsmEditor): the every-cycle blocks, the connections
// (their routes, a case's exit values, the selected one), the boxes (states with their code, decisions, cases,
// conditional outputs, their problems marked) and the status line; the toolbar's state. mountRender(ctx) is called by
// mountAsmEditor where this code was.
import { stateEncoding } from '/core/asm.js';
import { esc } from './dom.js';
import { CASE_BAR, nodeSize, box, pathD, portGeom, portsOf, routeEdge } from './asm-editor.js';

/** { render, updateToolbar } of an ASM chart editor (state(): its current model, selection, problems, history). */
export function mountRender(ctx) {
  const { state, uid, gBlocks, gEdges, gNodes, statusInfo, delBtn, encSel, nodeById, caseExits, exitsOf, drawTarget } = ctx;

  function blockMembers(stateId) {
    const { M } = state();
    const out = new Set([stateId]);
    const stack = [];
    const push = (id) => { const n = nodeById(id); if (n && n.type !== 'state' && n.type !== 'always' && !out.has(id)) { out.add(id); stack.push(id); } };
    for (const e of M.edges) if (e.from === stateId && e.port === 'next') push(e.to);
    while (stack.length) {
      const id = stack.pop();
      for (const e of M.edges) if (e.from === id) push(e.to);
    }
    return out;
  }

  function render() {
    const { M, sel, diags } = state();
    const diagBy = new Map();
    for (const d of diags) {
      if (!d.nodeId) continue;
      const cur = diagBy.get(d.nodeId);
      if (!cur || (cur === 'warning' && d.severity === 'error') || cur === 'info') diagBy.set(d.nodeId, d.severity);
    }
    let enc = new Map();
    try { enc = new Map(stateEncoding(M).map((s) => [s.id, s])); } catch { /* ignore */ }

    // ASM block outlines
    let bh = '';
    for (const s of M.nodes) {
      if (s.type !== 'state' && s.type !== 'always') continue;
      const mem = blockMembers(s.id);
      if (mem.size < 2) continue;
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (const id of mem) {
        const bx = box(nodeById(id));
        l = Math.min(l, bx.l); r = Math.max(r, bx.r); t = Math.min(t, bx.t); b = Math.max(b, bx.b);
      }
      bh += `<rect class="asm-block${s.type === 'always' ? ' asm-block-always' : ''}" x="${l - 14}" y="${t - 32}" width="${r - l + 28}" height="${b - t + 46}" rx="10"/>`;
    }
    gBlocks.innerHTML = bh;

    // edges
    const lanes = { l: 0, r: 0 };
    let eh = '';
    for (const e of M.edges) {
      const a = nodeById(e.from), b = drawTarget(e);
      if (!a || !b) continue;
      let pts;
      if (e.points?.length) {
        const p = portGeom(a, e.port, b);
        pts = [p, ...e.points, { x: b.x, y: box(b).t }];
      } else {
        const p = portGeom(a, e.port, b);
        const goingUp = box(b).t < p.y + 20;
        let lane = 0;
        if (goingUp) {
          const right = p.dy ? b.x >= a.x - 1 : p.dx > 0;
          lane = right ? lanes.r++ : lanes.l++;
        }
        pts = routeEdge(a, e.port, b, lane);
      }
      const d = pathD(pts);
      const selc = sel.edge === e.id ? ' sel' : '';
      let label = '';
      if (a.type === 'decision') {
        const p = pts[0];
        const lx = e.port === 'false' ? p.x + (a.flip ? -10 : 10) : p.x + 9;
        const ly = e.port === 'false' ? p.y - 7 : p.y + 14;
        label = `<text class="asm-edge-label" x="${lx}" y="${ly}" text-anchor="${e.port === 'false' && a.flip ? 'end' : 'start'}">${e.port === 'true' ? '1' : '0'}</text>`;
      } else if (a.type === 'case') {
        const p = pts[0];
        label = `<text class="asm-edge-label asm-case-label" x="${p.x + 5}" y="${p.y + 13}">${esc(e.port)}</text>`;
      }
      eh += `<g class="asm-edge${selc}" data-edge="${esc(e.id)}"><path class="asm-edge-hit" d="${d}"/>` +
        `<path class="asm-edge-line" d="${d}" marker-end="url(#${uid}-arr${selc ? '-sel' : ''})"/>${label}</g>`;
    }
    // case boxes: stem and bar from which the exits leave
    let ch = '';
    for (const n of M.nodes) {
      if (n.type !== 'case') continue;
      const bx = box(n), by = bx.b + CASE_BAR;
      const xs = [n.x];
      for (const e of M.edges) { const t = e.from === n.id && drawTarget(e); if (t) xs.push(t.x); }
      ch += `<path class="asm-case-bar" d="M${n.x},${bx.b} L${n.x},${by} M${Math.min(...xs)},${by} L${Math.max(...xs)},${by}"/>`;
    }
    gEdges.innerHTML = ch + eh;

    // nodes
    const inAlways = new Set();
    for (const a of M.nodes) if (a.type === 'always') for (const id of blockMembers(a.id)) inAlways.add(id);
    let nh = '';
    for (const n of M.nodes) {
      const { w, h: hh } = nodeSize(n);
      const cls = ['asm-node', `asm-${n.type}`];
      if (sel.nodes.has(n.id)) cls.push('sel');
      const sev = diagBy.get(n.id);
      if (sev === 'error') cls.push('err'); else if (sev === 'warning') cls.push('warn');
      if (n.id === M.initial) cls.push('initial');
      let inner = '';
      const lines = (arr) => {
        const lh = 17, y0 = -((arr.length - 1) * lh) / 2;
        return arr.map((l, i) => `<text class="asm-text" x="0" y="${y0 + i * lh}" dominant-baseline="central" text-anchor="middle">${esc(l)}</text>`).join('');
      };
      if (n.type === 'state') {
        inner += `<rect class="asm-shape" x="${-w / 2}" y="${-hh / 2}" width="${w}" height="${hh}" rx="3"/>`;
        inner += n.actions.length ? lines(n.actions) : `<text class="asm-text asm-empty" x="0" y="0" dominant-baseline="central" text-anchor="middle">no outputs</text>`;
        const name = n.name || '?';
        const tw = Math.max(36, name.length * 7.6 + 16 + (n.id === M.initial ? 14 : 0));
        inner += `<g class="asm-tag" transform="translate(${-w / 2},${-hh / 2 - 22})">` +
          `<rect width="${tw}" height="20" rx="4"/>` +
          (n.id === M.initial ? `<path class="asm-init-mark" d="M7,5 L13,10 L7,15 z"/>` : '') +
          `<text x="${n.id === M.initial ? 17 : 8}" y="10.5" dominant-baseline="central">${esc(name)}</text></g>`;
        const code = enc.get(n.id);
        if (code && M.encoding !== 'enum') inner += `<text class="asm-statecode" x="${w / 2}" y="${-hh / 2 - 7}" text-anchor="end">${esc(code.bits)}</text>`;
      } else if (n.type === 'always') {
        inner += `<rect class="asm-shape" x="${-w / 2}" y="${-hh / 2}" width="${w}" height="${hh}" rx="3"/>`;
        inner += `<rect class="asm-always-band" x="${-w / 2}" y="${-hh / 2}" width="${w}" height="6" rx="2"/>`;
        inner += n.actions.length ? lines(n.actions) : `<text class="asm-text asm-empty" x="0" y="0" dominant-baseline="central" text-anchor="middle">every clock cycle</text>`;
        const label = `↻ ${n.name || '?'}`;
        const tw = Math.max(36, label.length * 7.6 + 16);
        inner += `<g class="asm-tag asm-tag-always" transform="translate(${-w / 2},${-hh / 2 - 22})">` +
          `<rect width="${tw}" height="20" rx="4"/><text x="8" y="10.5" dominant-baseline="central">${esc(label)}</text></g>`;
      } else if (n.type === 'decision') {
        inner += `<polygon class="asm-shape" points="0,${-hh / 2} ${w / 2},0 0,${hh / 2} ${-w / 2},0"/>`;
        inner += `<text class="asm-text" x="0" y="0" dominant-baseline="central" text-anchor="middle">${esc(n.cond || '?')}</text>`;
      } else if (n.type === 'case') {
        const k = hh / 2;
        inner += `<polygon class="asm-shape" points="${-w / 2},0 ${-w / 2 + k},${-hh / 2} ${w / 2 - k},${-hh / 2} ${w / 2},0 ${w / 2 - k},${hh / 2} ${-w / 2 + k},${hh / 2}"/>`;
        inner += `<text class="asm-text" x="0" y="0" dominant-baseline="central" text-anchor="middle">${esc(n.expr || '?')}</text>`;
      } else {
        inner += `<rect class="asm-shape" x="${-w / 2}" y="${-hh / 2}" width="${w}" height="${hh}" rx="${Math.min(hh / 2, 22)}"/>`;
        inner += n.actions.length ? lines(n.actions) : `<text class="asm-text asm-empty" x="0" y="0" dominant-baseline="central" text-anchor="middle">no outputs</text>`;
      }
      // ports
      const ex = exitsOf(n.id);
      if (n.type === 'case') {
        for (const e of caseExits(n.id)) {
          const g = portGeom(n, e.port, drawTarget(e));
          inner += `<circle class="asm-port" data-port="${esc(e.port)}" cx="${g.x - n.x}" cy="${g.y - n.y}" r="5.5"><title>exit ${esc(e.port)} - drag to another box to reconnect</title></circle>`;
        }
        const g = portGeom(n, '+');
        inner += `<circle class="asm-port free" data-port="+" cx="${g.x - n.x}" cy="${g.y - n.y}" r="5.5"><title>new exit (next free value) - drag to a box to connect</title></circle>`;
      }
      for (const p of n.type === 'case' ? [] : portsOf(n)) {
        const g = portGeom(n, p);
        const lx = g.x - n.x, ly = g.y - n.y;
        // an unconnected exit of an every-cycle block is the end of the block: drawn as a terminator
        const end = !ex[p] && inAlways.has(n.id);
        if (end) {
          const ex2 = lx + g.dx * 16, ey2 = ly + g.dy * 16;
          inner += `<path class="asm-end" d="M${lx},${ly} L${ex2},${ey2} M${ex2 - (g.dy ? 7 : 0)},${ey2 - (g.dx ? 7 : 0)} L${ex2 + (g.dy ? 7 : 0)},${ey2 + (g.dx ? 7 : 0)}"/>`;
        }
        const free = ex[p] ? '' : end ? ' end' : ' free';
        const what = n.type === 'decision' ? (p === 'true' ? 'true (1) exit' : 'false (0) exit') : 'exit';
        inner += `<circle class="asm-port${free}" data-port="${esc(p)}" cx="${lx}" cy="${ly}" r="5.5"><title>${esc(what)}${end ? ' (unconnected: end of the every-cycle block)' : ''} - drag to a box to connect</title></circle>`;
      }
      nh += `<g class="${cls.join(' ')}" data-node="${esc(n.id)}" transform="translate(${n.x},${n.y})">${inner}</g>`;
    }
    gNodes.innerHTML = nh;

    const ns = M.nodes.filter((n) => n.type === 'state').length;
    const na = M.nodes.filter((n) => n.type === 'always').length;
    const ne = diags.filter((d) => d.severity === 'error').length, nw = diags.filter((d) => d.severity === 'warning').length;
    statusInfo.innerHTML = `${esc(M.name)} · ${ns} state${ns === 1 ? '' : 's'} · ` +
      (na ? `${na} every-cycle block${na === 1 ? '' : 's'} · ` : '') +
      `<span class="${ne ? 'c-err' : 'c-ok'}">${esc(ne)} error${ne === 1 ? '' : 's'}</span> · ` +
      `<span class="${nw ? 'c-warn' : ''}">${esc(nw)} warning${nw === 1 ? '' : 's'}</span>`;
  }

  function updateToolbar() {
    const { M, sel, hist, hi } = state();
    delBtn.disabled = !sel.edge && !sel.nodes.size;
    encSel.value = M.encoding;
  }

  return { render, updateToolbar };
}
