// I/O Pin Planning's Board view (#2694): the board drawn as the Board Emulator draws it (its layouts, emulator-*.js),
// its parts the targets of the ports dragged from the Ports panel (pinplanner-ports.js, #2715): the LEDs, switches,
// buttons, the digits of the 7-segment display. A part shows the port bit placed on it; its right-click menu takes the
// bit off it. What the drawing has no part for is dropped on Board Resources' rows (pinplanner.js).
import { h } from './dom.js';
import { BOARD_LAYOUTS } from './emulator-layouts.js';
import { pinLabels } from '/core/pin-board.js';

/**
 * ctx: { host, board, title, assignments() (the planner's, read at each drawing), pinMenu(event, pin) (the menu of a
 * pin with a bit on it), emulator (the module emulator.js: its style and its 7-segment digit) }. Returns { render() }.
 */
export function mountPinBoard({ host, board, title, assignments, pinMenu, emulator }) {
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
    for (const el of drawing.querySelectorAll('[data-part]')) {
      const t = target(el.dataset.part);
      if (!t) continue;
      el.classList.add('pp-target');
      const [res, idx] = t.digit != null ? ['an', t.digit] : [t.res, t.idx];
      if (t.digit != null) el.dataset.digit = t.digit;
      else { el.dataset.res = t.res; el.dataset.idx = t.idx; }
      const who = bitFor(res, idx), pin = resOf(res).pins[idx];
      el.classList.toggle('pp-on', !!who);
      if (t.digit == null) el.title = `${pinLabels(resOf(res))[idx]} (${pin})${who ? `: ${who}` : ''}`;
      // (its right-click menu: the bit taken off it)
      el.addEventListener('contextmenu', (e) => pinMenu(e, pin));
    }
    host.append(drawing);
  }

  return { render };
}
