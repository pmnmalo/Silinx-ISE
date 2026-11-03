// I/O Pin Planning's Board view (#2694): the board drawn as the Board Emulator draws it (its layouts, emulator-*.js),
// the design's ports beside it, dragged (mouse or finger) onto its parts: the LEDs, switches, buttons, the digits of
// the 7-segment display; the resources the drawing has no part for (the clocks, VGA, PS/2, the serial port, the Pmods,
// the segments…) as chips under it. A part shows the port bit placed on it. What a drop places: core/pin-board.js.
import { h } from './dom.js';
import { BOARD_LAYOUTS } from './emulator-layouts.js';
import { boardDrop, digitTarget, pinLabels, portNets } from '/core/pin-board.js';

const NEAR = 28;   // (px: a drop beside a small part, an LED, still on it)

/**
 * ctx: { host, board, title, ports, assignments() (the planner's, read at each drawing), drop(result, port) (applies
 * a boardDrop's result: undoable), emulator (the module emulator.js: its style and its 7-segment digit) }.
 * Returns { render() }.
 */
export function mountPinBoard({ host, board, title, ports, assignments, drop, emulator }) {
  emulator.injectStyle();
  const at = (res, k) => {
    const loc = res?.pins[k];
    if (!loc) return null;
    const L = loc.toUpperCase();
    return Object.entries(assignments()).find(([, a]) => String(a?.loc || '').toUpperCase() === L)?.[0] || null;
  };
  const resOf = (name) => board.resources.find((r) => r.name === name);
  const bitFor = (res, k = 0) => at(resOf(res), k);
  const portLabel = (res, k = 0) => bitFor(res, k) || '—';
  const msg = h('div', { class: 'pp-drop-msg' });

  // the parts: the emulator's look, nothing they do (the drop targets are found from the layout's data-part)
  const mkLed = (k, cls = 'emu-led') => h('div', { class: cls });
  const mkSwitch = (k, cls = 'emu-sw') => h('div', { class: cls });
  const mkButton = (k, cls = 'emu-btn') => h('div', { class: cls });
  const mkDigit = () => emulator.makeDigit().el;
  const mkPower = () => h('div', { class: 'emu-power on' }, h('div', { class: 'emu-power-sw' }), h('div', { class: 'emu-power-led' }));
  const mkLcd = () => h('div', { class: 'emu-lcd' });
  const mkRotary = () => h('div', { class: 'emu-rot' });

  // a part of the drawing: its resource and pin index (led3: led's 4th pin; btn_n: the resource of that name; an2: the
  // third digit), or null (the power switch, the LCD)
  const target = (name) => {
    if (resOf(name)) return { res: name, idx: 0 };
    const m = /^(.*?)(\d+)$/.exec(name);
    if (m && m[1] === 'an' && resOf('seg')) return { digit: +m[2] };
    return m && resOf(m[1]) ? { res: m[1], idx: +m[2] } : null;
  };
  // a board without a layout: rows of LEDs, switches and buttons (the emulator's generic board)
  const rows = () => {
    const el = h('div', { class: 'emu-board' }, h('h3', {}, board.name));
    const row = (name, mk) => {
      const r = resOf(name);
      if (!r) return;
      el.append(h('div', { class: 'emu-row' }, ...r.pins.map((_, i) => r.pins.length - 1 - i).map((k) => h('div', { class: 'emu-cell', 'data-part': `${name}${k}` },
        mk(k), h('span', { class: 'res' }, `${name}${k}`), h('span', { class: 'port' }, portLabel(name, k))))));
    };
    if (resOf('an') && resOf('seg')) {
      el.append(h('div', { class: 'emu-row' }, h('div', { class: 'emu-disp' }, ...resOf('an').pins.map((_, i) => resOf('an').pins.length - 1 - i)
        .map((k) => h('div', { class: 'emu-cell', 'data-part': `an${k}` }, mkDigit(), h('span', { class: 'port' }, portLabel('an', k)))))));
    }
    row('led', mkLed); row('sw', mkSwitch); row('btn', mkButton);
    return el;
  };

  function render() {
    host.innerHTML = '';
    const layout = BOARD_LAYOUTS[board.id];
    const drawing = layout
      ? layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote: 'Drag a port onto a part of the board', mkLcd, mkRotary, turnKnob: () => {}, mkPower })
      : rows();
    // the parts as drop targets, those with a port on them marked
    const drawn = new Set();
    for (const el of drawing.querySelectorAll('[data-part]')) {
      const t = target(el.dataset.part);
      if (!t) continue;
      el.classList.add('pp-target');
      if (t.digit != null) { el.dataset.digit = t.digit; drawn.add('an'); el.classList.toggle('pp-on', !!bitFor('an', t.digit)); continue; }
      el.dataset.res = t.res; el.dataset.idx = t.idx; drawn.add(t.res);
      const who = bitFor(t.res, t.idx);
      el.classList.toggle('pp-on', !!who);
      el.title = `${pinLabels(resOf(t.res))[t.idx]} (${resOf(t.res).pins[t.idx]})${who ? `: ${who}` : ''}`;
    }
    // the resources not drawn as parts: chips, each with the ports on it
    const chips = board.resources.filter((r) => !drawn.has(r.name)).map((r) => {
      const on = r.pins.map((_, k) => at(r, k)).filter(Boolean);
      return h('div', { class: `pp-chip pp-target${on.length ? ' pp-on' : ''}`, 'data-res': r.name, 'data-idx': 0, title: `${r.label} (${r.pins.join(', ')})` },
        h('b', {}, r.name), h('span', { 'data-no-i18n': true }, on.length ? ` ${on.join(', ')}` : ` ${r.pins.length > 1 ? `(${r.pins.length})` : ''}`));
    });
    // the ports, each placed on how many of its bits
    const list = h('div', { class: 'pp-ports' }, h('h4', {}, 'Ports'), ...ports.map((p) => {
      const nets = portNets(p), a = assignments(), n = nets.filter((x) => a[x.net]?.loc).length;
      const chip = h('div', { class: `pp-port${n === nets.length ? ' placed' : n ? ' partial' : ''}`, 'data-port': p.name, title: 'Drag it onto a part of the board' },
        h('span', { class: 'pp-dir' }, p.dir === 'in' ? '→' : p.dir === 'out' ? '←' : '↔'),
        h('span', { class: 'pp-pname', 'data-no-i18n': true }, p.bus ? `${p.name}(${p.msb}:${p.lsb})` : p.name),
        h('span', { class: 'pp-pcount' }, `${n}/${nets.length}`));
      dragFrom(chip, p);
      return chip;
    }));
    host.append(list, h('div', { class: 'pp-board-main' }, drawing,
      chips.length ? h('div', { class: 'pp-chips' }, h('h4', {}, 'Other resources of the board'), ...chips) : null, msg));
  }

  // dragging a port: a ghost under the pointer, the part under it (or near it) lit, dropped on release
  function dragFrom(chip, p) {
    chip.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      e.preventDefault();
      chip.setPointerCapture?.(e.pointerId);
      const ghost = h('div', { class: 'pp-ghost', 'data-no-i18n': true }, p.name);
      document.body.append(ghost);
      let over = null;
      const move = (ev) => {
        ghost.style.left = `${ev.clientX + 8}px`; ghost.style.top = `${ev.clientY + 8}px`;
        const t = targetAt(ev.clientX, ev.clientY);
        if (t !== over) { over?.classList.remove('pp-over'); over = t; over?.classList.add('pp-over'); }
      };
      const end = (ev, ok) => {
        chip.removeEventListener('pointermove', move); chip.removeEventListener('pointerup', up); chip.removeEventListener('pointercancel', cancel);
        ghost.remove(); over?.classList.remove('pp-over');
        if (ok && over) dropOn(p, over);
      };
      const up = (ev) => { move(ev); end(ev, true); };
      const cancel = (ev) => end(ev, false);
      chip.addEventListener('pointermove', move); chip.addEventListener('pointerup', up); chip.addEventListener('pointercancel', cancel);
      move(e);
    });
  }
  const targetAt = (x, y) => {
    const direct = document.elementFromPoint(x, y)?.closest('.pp-target');
    if (direct && host.contains(direct)) return direct;
    let best = null, bd = NEAR;
    for (const el of host.querySelectorAll('.pp-target')) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (d < bd) { bd = d; best = el; }
    }
    return best;
  };

  function dropOn(p, el) {
    const t = el.dataset.digit != null ? digitTarget(board, p, +el.dataset.digit) : { res: resOf(el.dataset.res), index: +el.dataset.idx };
    if (!t?.res) return;
    const r = boardDrop({ port: p, res: t.res, index: t.index, assignments: assignments() });
    drop(r, p);
    // the bits placed (names: not translated), the pins taken from other ports, the warnings
    msg.replaceChildren(h('div', { 'data-no-i18n': true }, r.placed.map(([n, l]) => `${n} → ${l}`).join(', ')),
      ...r.notes.map((l) => h('div', {}, l)), ...r.warnings.map((w) => h('div', { class: 'pp-warn' }, `⚠ ${w}`)));
  }

  return { render };
}
