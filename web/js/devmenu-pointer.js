// The Development menu's Pen and Touch Test (#1054): what a screen reports of its pointers, to tell whether an
// interactive board's pen comes as 'pen' or as 'touch' (Silinx treats them differently: a second touch contact, a
// palm on the glass, starts the two-finger pan and zoom of a drawing, #674, while a pen edits as the mouse does).
// A drawing area where every pointer leaves a trail in its own colour; each pointer's last reading (its type, id,
// pressure, contact size, tilt, buttons) and what Silinx would do with it; the number of pointers down at once;
// the screen's facts (touch points, media queries, pixel ratio, viewport). Copy Report puts it all on the
// clipboard as English text, to be pasted into an issue, and shows it in the window (where the clipboard is not
// allowed, it can be selected there).
import { h, dialog } from './ui.js';
import { writeClip } from './clipboard.js';
import { BUILD, VERSION } from '/core/version.js';

// ui.js longPressMenu's own: held still that long within that many px, a touch or a pen opens the context menu
const LP_DELAY = 500, LP_SLOP = 8;
const COLOURS = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#e377c2', '#8c564b'];
const HELD = 'Edits; held still: the context menu';
const MAX_ROWS = 8;     // the pointers listed: the last ones seen
const yesNo = v => (v == null ? '—' : v ? 'yes' : 'no');
const num = (v, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? String(+v.toFixed(d)) : '—');

/** The screen's facts: its touch points, the media queries the app's layout reads, its pixel ratio, the viewport. */
function screenFacts(w = window) {
  const mq = q => (typeof w.matchMedia === 'function' ? w.matchMedia(q).matches : null);
  return [
    ['navigator.maxTouchPoints', String(w.navigator?.maxTouchPoints ?? '—')],
    ['(pointer: coarse)', yesNo(mq('(pointer: coarse)'))],
    ['(any-pointer: fine)', yesNo(mq('(any-pointer: fine)'))],
    ['(hover: none)', yesNo(mq('(hover: none)'))],
    ['devicePixelRatio', num(w.devicePixelRatio)],
    ['viewport', `${w.innerWidth} × ${w.innerHeight}`],
  ];
}

/**
 * What Silinx does with a pointer pressed on a drawing (ui.js twoFingerView and longPressMenu): a touch while another
 * touch is down is the two-finger pan and zoom; a primary touch or pen edits, and held still opens the context menu;
 * the mouse edits.
 */
function silinxAction(type, isPrimary, otherTouches) {
  if (type === 'touch' && otherTouches > 0) return 'Two-finger pan and zoom';
  if ((type === 'touch' || type === 'pen') && isPrimary) return HELD;
  return 'Edits, as the mouse';
}

/** The report: the build, the browser, the screen's facts, the most pointers down at once and every pointer seen. */
function pointerReport({ facts, pointers, most, build = BUILD, version = VERSION, ua = navigator.userAgent }) {
  return [
    'Silinx: pen and touch test',
    `Silinx ${version}${build?.commit ? ` (commit ${build.commit})` : ''}`,
    `Browser: ${ua}`,
    `Screen: ${facts.map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    `Pointers down at once (most): ${most}`,
    `Pointers (${pointers.length}):`,
    ...pointers.map(p => `  ${p.type} #${p.id}${p.primary ? ' primary' : ''} · pressure ${num(p.pressure)} · contact ${num(p.width, 1)} × ${num(p.height, 1)}`
      + ` · tilt ${num(p.tiltX, 0)} / ${num(p.tiltY, 0)} · buttons ${p.buttons} · ${p.events} events · ${p.state} · Silinx: ${p.action}`),
    '',
  ].join('\n');
}

/** The window: the drawing area, the pointers, the screen, Copy Report. */
export function pointerTestDialog() {
  const pointers = new Map();     // pointerType:pointerId → the pointer's last reading, its trail, its long-press timer
  const down = new Set();         // the keys of the pointers down
  let most = 0, next = 0;
  const canvas = h('canvas', { class: 'ptr-pad', style: { display: 'block', width: '100%', height: '260px', touchAction: 'none', border: '1px solid var(--border)', background: 'var(--panel)', cursor: 'crosshair' } });
  const count = h('div', { class: 'ptr-count' });
  const rows = h('tbody', {});
  const report = h('pre', { class: 'ptr-report', 'data-no-i18n': '', style: { display: 'none', maxHeight: '160px', overflow: 'auto', userSelect: 'text', whiteSpace: 'pre-wrap', fontSize: '11px' } });
  const copied = h('span', { class: 'ptr-copied' });
  const cell = (text, raw) => h('td', raw ? { 'data-no-i18n': '', style: { whiteSpace: 'nowrap', paddingRight: '8px' } } : {}, text);
  const facts = () => screenFacts();
  const factsBody = h('tbody', {});
  const showFacts = () => factsBody.replaceChildren(...facts().map(([k, v]) => h('tr', {}, h('td', {}, h('code', {}, k)), cell(v, true))));

  const ctx = canvas.getContext('2d');
  const fit = () => {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width) return;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };
  const redraw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pointers.values()) for (const s of p.strokes) {
      ctx.strokeStyle = ctx.fillStyle = p.colour;
      ctx.beginPath();
      s.forEach((q, i) => { ctx.lineWidth = 1 + 4 * (q.pressure || 0.5); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      if (s.length === 1) ctx.fillRect(s[0].x - 2, s[0].y - 2, 4, 4); else ctx.stroke();
    }
  };
  const render = () => {
    count.textContent = `Pointers down at once: ${down.size} (most: ${most})`;
    rows.replaceChildren(...[...pointers.values()].slice(-MAX_ROWS).map(p => h('tr', { 'data-key': p.key },
      h('td', {}, h('span', { style: { display: 'inline-block', width: '10px', height: '10px', background: p.colour, marginRight: '4px' } })),
      cell(p.type, true), cell(String(p.id), true), cell(yesNo(p.primary), true), cell(num(p.pressure), true),
      cell(`${num(p.width, 1)} × ${num(p.height, 1)}`, true), cell(`${num(p.tiltX, 0)} / ${num(p.tiltY, 0)}`, true),
      cell(String(p.buttons), true), cell(p.state), cell(p.action))));
  };

  const at = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, pressure: e.pressure }; };
  // (a lift keeps the pointer's last reading while it was down: a pointerup's pressure and buttons are 0)
  const read = (e, state, reading = true) => {
    const key = `${e.pointerType}:${e.pointerId}`;
    let p = pointers.get(key);
    if (!p) { p = { key, colour: COLOURS[next++ % COLOURS.length], strokes: [], events: 0, action: silinxAction(e.pointerType, e.isPrimary, 0) }; pointers.set(key, p); }
    else { pointers.delete(key); pointers.set(key, p); }    // the last one seen last
    if (reading || p.type === undefined) Object.assign(p, { type: e.pointerType || '(none)', id: e.pointerId, primary: e.isPrimary, pressure: e.pressure,
      width: e.width, height: e.height, tiltX: e.tiltX, tiltY: e.tiltY, buttons: e.buttons });
    p.state = state;
    p.events++;
    return p;
  };
  const stopTimer = p => { clearTimeout(p.timer); p.timer = 0; };
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    const touches = [...down].filter(k => k.startsWith('touch:')).length;
    const p = read(e, 'Pressed');
    p.action = silinxAction(e.pointerType, e.isPrimary, touches);
    down.add(p.key); most = Math.max(most, down.size);
    p.strokes.push([at(e)]);
    p.start = { x: e.clientX, y: e.clientY };
    stopTimer(p);
    if (p.action === HELD) p.timer = setTimeout(() => { p.action = 'Long press: the context menu'; render(); }, LP_DELAY);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not an active pointer (a dispatched event) */ }
    redraw(); render();
  });
  canvas.addEventListener('pointermove', e => {
    const key = `${e.pointerType}:${e.pointerId}`, isDown = down.has(key);
    const p = read(e, isDown ? 'Pressed' : 'Hovering');
    if (isDown) {
      p.strokes.at(-1).push(at(e));
      if (p.timer && Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) > LP_SLOP) stopTimer(p);
      redraw();
    }
    render();
  });
  const lift = e => {
    const p = read(e, e.type === 'pointercancel' ? 'Cancelled' : 'Lifted', false);
    stopTimer(p);
    down.delete(p.key);
    render();
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  const snapshot = () => pointerReport({ facts: facts(), most, pointers: [...pointers.values()] });
  const clear = () => {
    for (const p of pointers.values()) stopTimer(p);
    pointers.clear(); down.clear(); most = 0; next = 0;
    report.style.display = 'none'; copied.textContent = '';
    redraw(); render();
  };
  const copy = () => {
    const text = snapshot();
    writeClip('text', text);
    report.textContent = text; report.style.display = '';
    copied.textContent = 'Report copied to the clipboard';
  };
  const th = (...l) => h('tr', {}, ...l.map(s => h('th', { style: { textAlign: 'left', paddingRight: '8px' } }, s)));
  const body = h('div', { class: 'ptr-test' },
    h('p', { style: { margin: '0 0 6px' } }, 'Draw here with the mouse, a pen or your fingers: each pointer leaves a trail in its own colour.'),
    canvas,
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0' } },
      count, h('span', { style: { flex: '1' } }),
      copied,
      h('button', { class: 'btn ptr-clear', onclick: clear }, 'Clear'),
      h('button', { class: 'btn ptr-copy', onclick: copy }, 'Copy Report')),
    h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' } },
      h('div', { style: { flex: '3 1 420px', overflowX: 'auto' } }, h('h4', {}, 'Pointers'),
        h('table', { class: 'ptr-pointers' }, h('thead', {}, th('', 'Type', 'ID', 'Primary', 'Pressure', 'Contact', 'Tilt', 'Buttons', 'State', 'Silinx')), rows)),
      h('div', { style: { flex: '1 1 200px' } }, h('h4', {}, 'Screen'), h('table', { class: 'ptr-screen' }, factsBody))),
    report);
  showFacts(); render();
  const onResize = () => { showFacts(); fit(); };
  return dialog({ title: 'Pen and Touch Test', body, width: 'min(900px, 96vw)', buttons: [{ label: 'Close', value: null, primary: true }],
    onOpen: () => { requestAnimationFrame(fit); addEventListener('resize', onResize); } })
    .finally(() => { for (const p of pointers.values()) stopTimer(p); removeEventListener('resize', onResize); });
}
