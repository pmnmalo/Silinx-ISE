// Live simulation view of the schematic editor (Logisim style): the sheet is read-only, input I/O
// markers are switches / bus value editors / clock steppers, bidirectional (inout) markers show the
// bus and can drive it from outside or release it (Z), every wire is coloured by its value,
// buses carry their value, outputs light up, registers show what they store, hovering shows values.
// The model is core/schlive.js; sch-editor.js owns the drawing and calls this module.
import { buildLiveSim, level, fmtValue, parseValue } from '/core/schlive.js';
import { symbolPins, symbolBox, SYMBOLS } from '/core/schdoc.js';
import { formatTime } from '/core/interp.js';
import { t } from './i18n.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LV = ['lv-1', 'lv-0', 'lv-x', 'lv-z', 'lv-n'];
const lvClass = v => `lv-${level(v) ?? 'n'}`;
const RATES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const rateText = r => (r >= 1000 ? `${r / 1000} kHz` : `${r} Hz`);
const textW = s => String(s).length * 6.2 + 8;
const isReg = s => !!(SYMBOLS[s.type]?.ff || s.type === 'register' || s.type === 'counter');

/**
 * Start the live simulation of a schematic.
 * ctx: { doc, modules, sources, lang, h, layer (svg <g> above the content), content (svg <g> of the drawing),
 *        bar (HTML strip above the canvas), canvas (positioned HTML box of the svg), toCanvas(pt) -> {x,y} px,
 *        onExit(), onRepaint?() }
 * Returns { ok: false, errors, warnings } or { ok: true, warnings, ctl }.
 */
export function startLiveSim(ctx) {
  const r = buildLiveSim(ctx.doc, { modules: ctx.modules, sources: ctx.sources, lang: ctx.lang });
  if (!r.ok) return { ok: false, errors: r.errors, warnings: r.warnings, diagnostics: r.diagnostics };
  return { ok: true, warnings: r.warnings, ctl: liveController(ctx, r.live) };
}

function liveController(ctx, live) {
  const { doc, modules, h, layer, content, bar, canvas } = ctx;
  const nl = live.nl;
  let radix = 'hex';
  try { radix = localStorage.getItem('xl.sch.liveRadix') || 'hex'; } catch { /* default */ }
  if (!['hex', 'dec', 'bin'].includes(radix)) radix = 'hex';
  let last = new Map();           // net id -> painted signature
  let wireEls = new Map();        // wire id -> <g class="wire">
  let junctionNet = [];           // [{ el, net }]
  let selSym = null;              // module instance shown in the properties panel
  let propEl = null;
  let errorText = null;
  let destroyed = false;
  const running = new Map();      // clock port id -> { rate, acc }
  let raf = 0, lastT = 0;

  // ------------------------------------------------------------------ static geometry
  const pins = [];                // every symbol pin: { x, y, sym, pin }
  for (const s of doc.symbols) { try { for (const p of symbolPins(s, modules)) pins.push({ x: p.x, y: p.y, sym: s, pin: p.name, width: p.width }); } catch { /* skip */ } }
  const wireById = new Map(doc.wires.map(w => [w.id, w]));
  // one value label per bus net: on its longest segment
  const busLabelAt = new Map();
  for (const net of nl.nets) {
    if (net.width <= 1 || !net.wires.length) continue;
    let best = null, bl = -1;
    for (const wid of net.wires) {
      const w = wireById.get(wid);
      for (let i = 0; w && i + 1 < w.points.length; i++) {
        const a = w.points[i], b = w.points[i + 1], L = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (L > bl) { bl = L; best = { a, b }; }
      }
    }
    if (best) busLabelAt.set(net.id, best);
  }

  // ------------------------------------------------------------------ the strip above the canvas
  bar.innerHTML = '';
  bar.hidden = false;
  const tEl = h('span', { class: 'lv-time', 'data-no-i18n': '' });
  const errEl = h('span', { class: 'lv-err', hidden: true });
  const radixSel = h('select', { class: 'lv-radix', title: 'Number format of the bus values' },
    h('option', { value: 'hex', text: 'Hex' }), h('option', { value: 'dec', text: 'Decimal' }), h('option', { value: 'bin', text: 'Binary' }));
  radixSel.value = radix;
  radixSel.addEventListener('change', () => { radix = radixSel.value; try { localStorage.setItem('xl.sch.liveRadix', radix); } catch { /* ignore */ } update(true); });
  const clocks = live.inputs.filter(i => i.clock);
  const clockBoxes = clocks.map(c => {
    const runBtn = h('button', { type: 'button', class: 'btn lv-run', title: 'Run / pause the clock', text: 'Run' });
    const rateSel = h('select', { class: 'lv-rate', title: 'Clock rate' }, ...RATES.map(x => h('option', { value: String(x), text: rateText(x) })));
    rateSel.value = '2';
    const stepBtn = h('button', { type: 'button', class: 'btn lv-step', title: 'One clock cycle (rising and falling edge)', text: 'Step' });
    stepBtn.addEventListener('click', () => { stopClock(c.id); act(() => live.cycle(c.id)); });
    runBtn.addEventListener('click', () => { if (running.has(c.id)) stopClock(c.id); else startClock(c.id, +rateSel.value); });
    rateSel.addEventListener('change', () => { const st = running.get(c.id); if (st) st.rate = +rateSel.value; });
    const box = h('span', { class: 'lv-clock', 'data-clock': c.name }, h('span', { class: 'lv-cname', text: `${c.name}`, 'data-no-i18n': '' }), stepBtn, runBtn, rateSel);
    return { c, runBtn, box };
  });
  bar.append(
    h('span', { class: 'lv-badge', text: 'Live simulation' }),
    h('button', { type: 'button', class: 'btn lv-reset', title: 'Power cycle: back to time 0, registers to their initial values', text: 'Reset', onclick: () => { stopAll(); act(() => live.reset()); } }),
    ...(clocks.length ? [h('span', { class: 'lv-sep' }), h('span', { class: 'lv-lbl', text: 'Clock:' }), ...clockBoxes.map(b => b.box)] : []),
    h('span', { class: 'lv-sep' }), h('label', { class: 'lv-lbl', text: 'Buses:' }), radixSel,
    h('span', { class: 'lv-sp' }), errEl, tEl,
    h('button', { type: 'button', class: 'btn lv-exit', title: 'Leave the simulation and edit the schematic (Esc)', text: 'Stop Simulation', onclick: () => ctx.onExit() }),
  );

  // ------------------------------------------------------------------ tooltip and bus editor
  const tip = h('div', { class: 'lv-tip', hidden: true, 'data-no-i18n': '' });
  canvas.append(tip);
  let editor = null;

  // ------------------------------------------------------------------ painting
  function rebuildEls() {
    wireEls = new Map();
    for (const g of content.querySelectorAll('g.wire[data-id]')) wireEls.set(g.dataset.id, g);
    junctionNet = [];
    const circles = content.querySelectorAll('circle.junction');
    if (circles.length) {
      const onW = (pt, w) => w.points.some((a, i) => {
        const b = w.points[i + 1];
        if (!b) return a.x === pt.x && a.y === pt.y;
        return (a.x === b.x && a.x === pt.x && pt.y >= Math.min(a.y, b.y) && pt.y <= Math.max(a.y, b.y)) || (a.y === b.y && a.y === pt.y && pt.x >= Math.min(a.x, b.x) && pt.x <= Math.max(a.x, b.x));
      });
      for (const el of circles) {
        const pt = { x: +el.getAttribute('cx'), y: +el.getAttribute('cy') };
        const w = doc.wires.find(q => onW(pt, q));
        const net = w && nl.wireNet.get(w.id);
        if (net) junctionNet.push({ el, net });
      }
    }
  }
  const setLv = (el, cls) => { if (!el.classList.contains(cls)) { el.classList.remove(...LV); el.classList.add(cls); } };
  function controlsSvg() {
    let s = '';
    for (const p of doc.ports) {
      const v = live.portValue(p.id), lv = lvClass(v), y = p.y;
      const inp = live.input(p.id), bd = live.bidir?.(p.id);
      if (bd) {
        // bidirectional marker: the value on the bus; click to drive it from outside or release it (Z)
        const tip = `${p.name}: ${t(bd.value == null ? 'released (Z): click to drive the bus' : 'driven from outside: click to change or release (Z)')}`;
        if (bd.width === 1) {
          s += `<g class="lv-ctl lv-out lv-bidir ${lv}" data-lv="bidir" data-port="${esc(p.id)}"><title>${esc(tip)}</title>`
            + `<circle class="lv-led" cx="${p.x + 15}" cy="${y}" r="5"/>`
            + `<text class="lv-val" x="${p.x + 15}" y="${y - 9}" text-anchor="middle">${bd.value == null ? 'Z' : String(bd.value)}</text></g>`;
        } else {
          const txt = `${bd.value == null ? '' : '▸'}${fmtValue(v, radix)}`, w = Math.max(30, textW(txt));
          s += `<g class="lv-ctl lv-out lv-bidir lv-bus ${lv}" data-lv="bidir" data-port="${esc(p.id)}"><title>${esc(tip)}</title>`
            + `<rect class="lv-box" x="${p.x + 3}" y="${y - 22}" width="${w}" height="13" rx="2"/>`
            + `<text class="lv-val" x="${p.x + 3 + w / 2}" y="${y - 12}" text-anchor="middle">${esc(txt)}</text></g>`;
        }
      } else if (inp && inp.clock) {
        const x = p.x - 27;
        s += `<g class="lv-ctl lv-clk ${lv}" data-lv="clock" data-port="${esc(p.id)}"><title>${esc(p.name)}: ${esc(t('click for one clock cycle'))}</title>`
          + `<rect class="lv-box" x="${x}" y="${y - 6}" width="16" height="12" rx="2"/>`
          + `<path class="lv-wave" d="M${x + 2},${y + 3} h3 v-6 h5 v6 h3"/></g>`;
      } else if (inp && inp.width === 1) {
        const x = p.x - 27, on = level(v) === '1';
        s += `<g class="lv-ctl lv-sw ${lv}" data-lv="toggle" data-port="${esc(p.id)}"><title>${esc(p.name)}: ${esc(t('click to toggle'))}</title>`
          + `<rect class="lv-box" x="${x}" y="${y - 6}" width="16" height="12" rx="2"/>`
          + `<rect class="lv-knob" x="${on ? x + 9 : x + 2}" y="${y - 4}" width="5" height="8" rx="1"/></g>`;
      } else if (inp) {
        const txt = fmtValue(v, radix), w = Math.max(30, textW(txt));
        s += `<g class="lv-ctl lv-bus ${lv}" data-lv="edit" data-port="${esc(p.id)}"><title>${esc(p.name)}: ${esc(t('click to change the value'))}</title>`
          + `<rect class="lv-box" x="${p.x - 3 - w}" y="${y - 22}" width="${w}" height="13" rx="2"/>`
          + `<text class="lv-val" x="${p.x - 3 - w / 2}" y="${y - 12}" text-anchor="middle">${esc(txt)}</text></g>`;
      } else if ((p.width || 1) === 1 && (v == null || v.w === 1)) {
        s += `<g class="lv-out ${lv}" data-port="${esc(p.id)}"><circle class="lv-led" cx="${p.x + 15}" cy="${y}" r="5"/></g>`;
      } else {
        const txt = fmtValue(v, radix), w = Math.max(30, textW(txt));
        s += `<g class="lv-out lv-bus ${lv}" data-port="${esc(p.id)}"><rect class="lv-box" x="${p.x + 3}" y="${y - 22}" width="${w}" height="13" rx="2"/>`
          + `<text class="lv-val" x="${p.x + 3 + w / 2}" y="${y - 12}" text-anchor="middle">${esc(txt)}</text></g>`;
      }
    }
    // registers: the value they store
    for (const s2 of doc.symbols) {
      if (!isReg(s2)) continue;
      const v = live.stored(s2.id);
      if (v == null) continue;
      let b;
      try { b = symbolBox(s2, modules); } catch { continue; }
      const txt = fmtValue(v, radix);
      s += `<g class="lv-store ${lvClass(v)}"><rect class="lv-box" x="${b.x + b.w + 2}" y="${b.y - 2}" width="${textW(txt)}" height="13" rx="2"/>`
        + `<text class="lv-val" x="${b.x + b.w + 6}" y="${b.y + 8}">${esc(txt)}</text></g>`;
    }
    // bus values on the wires
    for (const [nid, seg] of busLabelAt) {
      const net = live.netById(nid), v = live.netValue(net);
      if (v == null) continue;
      const txt = fmtValue(v, radix);
      const horiz = seg.a.y === seg.b.y;
      const x = horiz ? (seg.a.x + seg.b.x) / 2 : seg.a.x + 5, y = horiz ? seg.a.y - 5 : (seg.a.y + seg.b.y) / 2 + 3;
      s += `<text class="lv-busval ${lvClass(v)}" x="${x}" y="${y}" text-anchor="${horiz ? 'middle' : 'start'}">${esc(txt)}</text>`;
    }
    return s;
  }
  /** Repaint: wires of the nets whose value changed (all of them when `full`), then the controls. */
  function update(full = false) {
    if (destroyed) return;
    if (full) rebuildEls();
    const snap = live.snapshot(radix);
    for (const net of nl.nets) {
      const sig = snap.get(net.id);
      if (!full && last.get(net.id) === sig) continue;
      const cls = lvClass(live.netValue(net));
      for (const wid of net.wires) { const el = wireEls.get(wid); if (el) setLv(el, cls); }
    }
    for (const { el, net } of junctionNet) if (full || last.get(net.id) !== snap.get(net.id)) setLv(el, lvClass(live.netValue(net)));
    last = snap;
    layer.innerHTML = controlsSvg();
    tEl.textContent = `t = ${formatTime(live.now)}`;
    const err = live.error;
    if (err !== errorText) {
      errorText = err;
      errEl.hidden = !err;
      errEl.textContent = err ? `Simulation stopped: ${err.split('\n')[0]}` : '';
      errEl.title = err || '';
      if (err) stopAll();
    }
    renderInstance();
    ctx.onRepaint?.();
  }
  function act(fn) { fn(); update(); }

  // ------------------------------------------------------------------ clocks
  function startClock(id, rate) {
    running.set(id, { rate, acc: 0 });
    syncClockBtns();
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function stopClock(id) { running.delete(id); syncClockBtns(); }
  function stopAll() { running.clear(); syncClockBtns(); }
  function syncClockBtns() {
    for (const b of clockBoxes) {
      const on = running.has(b.c.id);
      b.runBtn.textContent = on ? 'Pause' : 'Run';
      b.runBtn.classList.toggle('on', on);
    }
  }
  function tick(t) {
    raf = 0;
    if (destroyed || !running.size) return;
    const dt = Math.min(0.25, Math.max(0, (t - lastT) / 1000));
    lastT = t;
    let any = false;
    for (const [id, st] of running) {
      st.acc += dt * st.rate;
      const n = Math.min(100, Math.floor(st.acc));
      if (n > 0) { st.acc -= n; live.cycles([id], n); any = true; }
    }
    if (any) update();
    if (running.size && !live.error) raf = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------ bus value editor
  function openEditor(portId) {
    closeEditor();
    const p = doc.ports.find(q => q.id === portId), bd = live.bidir?.(portId), inp = live.input(portId) || bd;
    if (!p || !inp) return;
    const setv = n => (bd ? live.drive(portId, n) : live.set(portId, n));
    const pos = ctx.toCanvas({ x: p.x - 30, y: p.y + 10 });
    const field = h('input', { type: 'text', class: 'lv-edit-in', spellcheck: 'false' });
    const rsel = h('select', { title: 'Number format' }, h('option', { value: 'bin', text: 'Bin' }), h('option', { value: 'hex', text: 'Hex' }), h('option', { value: 'dec', text: 'Dec' }));
    rsel.value = radix;
    const show = () => { field.value = fmtValue(live.portValue(portId), rsel.value).replace(/^X+$|^Z+$/, ''); };
    const apply = () => {
      const n = parseValue(field.value, inp.width, rsel.value);
      if (n == null) { field.classList.add('bad'); return false; }
      field.classList.remove('bad');
      act(() => setv(n));
      show();
      return true;
    };
    const step = d => { act(() => setv((inp.value ?? 0n) + BigInt(d))); show(); };
    rsel.addEventListener('change', show);
    field.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { if (apply()) closeEditor(); }
      else if (e.key === 'Escape') closeEditor();
      else if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
    });
    const box = h('div', { class: 'lv-editor', style: `left:${Math.max(4, pos.x)}px;top:${Math.max(4, pos.y)}px` },
      h('div', { class: 'lv-edit-head' }, h('b', { text: `${p.name}`, 'data-no-i18n': '' }), h('span', { text: ` (${inp.width} bits)`, 'data-no-i18n': '' }), h('span', { class: 'lv-sp' }),
        h('button', { type: 'button', class: 'lv-x', title: 'Close', text: '×', onclick: closeEditor })),
      h('div', { class: 'lv-edit-row' }, field, rsel),
      h('div', { class: 'lv-edit-row' },
        h('button', { type: 'button', class: 'btn', title: 'Subtract 1', text: '−1', onclick: () => step(-1) }),
        h('button', { type: 'button', class: 'btn', title: 'Add 1', text: '+1', onclick: () => step(1) }),
        h('button', { type: 'button', class: 'btn', text: '0', title: 'All bits 0', onclick: () => { act(() => setv(0n)); show(); } }),
        bd ? h('button', { type: 'button', class: 'btn lv-release', text: 'Z', title: 'Release the bus (Z): the circuit drives it', onclick: () => { act(() => live.drive(portId, null)); closeEditor(); } }) : null,
        h('button', { type: 'button', class: 'btn primary', text: 'Set', onclick: () => { if (apply()) closeEditor(); } })),
      h('div', { class: 'lv-note', text: 'Hex 0x1F, binary 0b101, or decimal; ↑ / ↓ add / subtract 1' }));
    box.addEventListener('pointerdown', e => e.stopPropagation());
    canvas.append(box);
    editor = { box, portId };
    // a marker near the right edge (bidirectional markers are on the right): keep the editor inside the canvas
    const over = box.offsetLeft + box.offsetWidth - (canvas.clientWidth - 4);
    if (over > 0) box.style.left = `${Math.max(4, box.offsetLeft - over)}px`;
    show();
    setTimeout(() => { field.focus(); field.select(); }, 0);
  }
  function closeEditor() { if (editor) { editor.box.remove(); editor = null; } }

  // ------------------------------------------------------------------ module instances
  function renderInstance() {
    if (!propEl) return;
    const box = propEl.querySelector('.lv-inst');
    if (!box) return;
    if (!selSym) { box.innerHTML = ''; return; }
    const ports = live.instancePorts(selSym.id);
    const rows = ports.length
      ? ports.map(p => `<tr class="${lvClass(p.value)}"><td>${esc(p.name)}</td><td>${p.dir === 'in' ? 'in' : p.dir === 'out' ? 'out' : 'inout'}</td><td class="v">${esc(fmtValue(p.value, radix))}</td></tr>`).join('')
      : (() => {
        let ps = [];
        try { ps = symbolPins(selSym, modules); } catch { /* none */ }
        return ps.map(p => { const v = live.pinValue(selSym.id, p.name); return `<tr class="${lvClass(v)}"><td>${esc(p.name)}</td><td>${p.dir}</td><td class="v">${esc(fmtValue(v, radix))}</td></tr>`; }).join('');
      })();
    box.innerHTML = `<div class="se-ptitle" data-no-i18n>${esc(selSym.name)} : ${esc(selSym.type === 'module' ? selSym.params.module : (SYMBOLS[selSym.type]?.title || selSym.type))}</div>`
      + `<table class="lv-ports" data-no-i18n><tbody>${rows}</tbody></table>`;
  }
  function renderProps(el) {
    propEl = el;
    el.innerHTML = '';
    el.append(h('div', { class: 'se-ptitle', text: 'Live simulation' }),
      h('div', { class: 'se-note', text: 'Click an input to change it: 1-bit inputs toggle, buses open a value editor, clock inputs step one cycle. Wires: green = 1, dark green = 0, red = X/U, blue = Z. Hover a pin or a wire to see its value; click a component to list its pins.' }),
      ...(live.bidirs?.length ? [h('div', { class: 'se-note lv-bidir-note', text: 'Bidirectional (inout) markers show the value on the bus. Click one to drive the bus from outside (1-bit: Z, 0, 1 in turn; a bus opens the value editor, Z releases it); released (Z), the circuit drives it.' })] : []),
      h('div', { class: 'lv-inst' }));
    renderInstance();
  }

  // ------------------------------------------------------------------ pointer
  /** Pointer down on the sheet: true when it was a simulation control. */
  function pointerDown(e, item) {
    const ctl = e.target.closest?.('[data-lv]');
    const portId = ctl?.dataset.port || (item?.kind === 'port' ? item.id : null);
    if (portId) {
      const bd = live.bidir?.(portId);
      if (bd) {   // released -> 0 -> 1 -> released (1 bit); a bus opens the value editor
        if (bd.width === 1) act(() => live.drive(portId, bd.value == null ? 0n : bd.value === 0n ? 1n : null));
        else openEditor(portId);
        return true;
      }
      const inp = live.input(portId);
      if (!inp) return false;
      if (inp.clock) { stopClock(portId); act(() => live.cycle(portId)); }
      else if (inp.width === 1) act(() => live.toggle(portId));
      else openEditor(portId);
      return true;
    }
    closeEditor();
    if (item?.kind === 'sym') { selSym = doc.symbols.find(s => s.id === item.id) || null; renderInstance(); return false; }
    return false;
  }
  function nearest(pt, tol) {
    let best = null, bd = tol;
    for (const p of pins) { const d = Math.hypot(p.x - pt.x, p.y - pt.y); if (d <= bd) { bd = d; best = { pin: p }; } }
    for (const p of doc.ports) { const d = Math.hypot(p.x - pt.x, p.y - pt.y); if (d <= bd) { bd = d; best = { port: p }; } }
    if (best) return best;
    for (const w of doc.wires) {
      for (let i = 0; i + 1 < w.points.length; i++) {
        const a = w.points[i], b = w.points[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L));
        if (Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy)) <= tol) return { wire: w };
      }
    }
    return null;
  }
  const valText = v => {
    if (v == null) return t('no value');
    if (Array.isArray(v) || v.w === 1) return fmtValue(v);
    const hx = fmtValue(v, 'hex'), dc = fmtValue(v, 'dec'), bn = fmtValue(v, 'bin');
    return `${hx}h · ${dc} · ${bn}b`;
  };
  function hover(e, pt, scale) {
    const hit = nearest(pt, 6 / Math.max(0.3, scale));
    if (!hit) { tip.hidden = true; return; }
    let text;
    if (hit.pin) {
      const net = nl.pinNet.get(`${hit.pin.sym.id}/${hit.pin.pin}`);
      const v = live.pinValue(hit.pin.sym.id, hit.pin.pin);
      const open = !net || (net.endpoints.length + net.wires.length + net.labels.length) <= 1;
      text = `${hit.pin.sym.name}.${hit.pin.pin} = ${valText(v)}${open && v == null ? ` ${t('(unconnected)')}` : net && !open ? `  → ${net.name}` : ''}`;
    } else if (hit.port) text = `${hit.port.name} = ${valText(live.portValue(hit.port.id))}`;
    else {
      const net = nl.wireNet.get(hit.wire.id);
      text = `${net ? net.name : '?'}${net && net.width > 1 ? `(${net.width - 1}:0)` : ''} = ${valText(live.netValue(net))}`;
    }
    tip.textContent = text;
    tip.hidden = false;
    const r = canvas.getBoundingClientRect();
    tip.style.left = `${Math.min(r.width - 40, e.clientX - r.left + 14)}px`;
    tip.style.top = `${Math.max(0, e.clientY - r.top + 16)}px`;
  }

  function destroy() {
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    running.clear();
    closeEditor();
    tip.remove();
    layer.innerHTML = '';
    for (const el of wireEls.values()) el.classList.remove(...LV);
    for (const { el } of junctionNet) el.classList.remove(...LV);
    bar.innerHTML = '';
    bar.hidden = true;
  }

  return {
    live, update, renderProps, pointerDown, hover, hideTip: () => { tip.hidden = true; }, destroy,
    closeEditor, get editing() { return !!editor; }, get radix() { return radix; },
    stopAll, clocks: clocks.map(c => c.id),
  };
}
