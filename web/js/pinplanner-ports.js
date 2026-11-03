// I/O Pin Planning's Ports panel (#2715): the top-level ports in the Board view's side panel on the left, as the
// schematic editor's Symbols (its title, folded to a strip: side-fold.js); a bus expanded into its bits; a port or one
// bit dragged (mouse or finger) onto a part of the board, or onto a row of Board Resources (what the drawing has no part
// for: the clocks, VGA, PS/2, the Pmods, the serial port), taken off its pins by its ✕. What a drop places:
// core/pin-board.js.
import { h } from './dom.js';
import { boardDrop, digitTarget, pinLabels, portBit, portNets, resourceOfPin } from '/core/pin-board.js';

const NEAR = 28;   // (px: a drop beside a small part, an LED, still on it)

/**
 * ctx: { list (the panel's body), root (the planner: its .pp-target elements, the board's parts and the rows of Board
 * Resources, are the drop targets), board, ports, assignments() (the planner's, read at each drawing), drop(result,
 * port) (applies a boardDrop's result: undoable), remove(nets) (takes them off their pins) }. Returns { render() }.
 */
export function mountPinPorts({ list, root, board, ports, assignments, drop, remove }) {
  const open = new Set();   // (the buses expanded, kept when the panel is drawn again)
  const resOf = (name) => board.resources.find((r) => r.name === name);
  // where a net is: the board's name of its pin (led<3>), or the pin
  const where = (net) => {
    const loc = assignments()[net]?.loc;
    if (!loc) return null;
    const r = resourceOfPin(board, loc);
    return r ? pinLabels(r.res)[r.idx] : loc;
  };
  const xBtn = (nets, title) => h('button', { type: 'button', class: 'pp-x', title, onclick: () => remove(nets) }, '✕');

  function render() {
    const a = assignments();
    list.replaceChildren(...ports.flatMap((p) => {
      const nets = portNets(p), n = nets.filter((x) => a[x.net]?.loc).length, exp = open.has(p.name);
      const row = h('div', { class: `pp-port${n === nets.length ? ' placed' : n ? ' partial' : ''}`, 'data-port': p.name, title: 'Drag it onto a part of the board or a row of Board Resources' },
        p.bus
          ? h('button', { type: 'button', class: `pp-exp${exp ? ' open' : ''}`, title: exp ? 'Collapse its bits' : 'Expand its bits', 'aria-expanded': String(exp), onclick: () => { if (exp) open.delete(p.name); else open.add(p.name); render(); } }, '▸')
          : h('span', { class: 'pp-exp' }),
        h('span', { class: 'pp-dir' }, p.dir === 'in' ? '→' : p.dir === 'out' ? '←' : '↔'),
        h('span', { class: 'pp-pname', 'data-no-i18n': true }, p.bus ? `${p.name}(${p.msb}:${p.lsb})` : p.name),
        h('span', { class: 'pp-pcount', 'data-no-i18n': true }, p.bus ? `${n}/${nets.length}` : where(nets[0].net) || '—'),
        n ? xBtn(nets.map((x) => x.net), p.bus ? 'Remove its bits from their pins' : 'Remove it from its pin') : null);
      dragFrom(row, p);
      if (!exp) return [row];
      // its bits, as the port declares them (led(3 downto 0): led<3> first)
      const bits = p.msb >= p.lsb ? [...nets].reverse() : nets;
      return [row, ...bits.map((x) => {
        const at = where(x.net);
        const b = h('div', { class: `pp-port pp-bit${at ? ' placed' : ''}`, 'data-net': x.net, title: 'Drag it onto a part of the board or a row of Board Resources' },
          h('span', { class: 'pp-pname', 'data-no-i18n': true }, x.net), h('span', { class: 'pp-pcount', 'data-no-i18n': true }, at || '—'),
          at ? xBtn([x.net], 'Remove it from its pin') : null);
        dragFrom(b, portBit(p, x.bit));
        return b;
      })];
    }));
  }

  // dragging a port or a bit: a ghost under the pointer, the target under it (or near it) lit, dropped on release
  function dragFrom(chip, p) {
    chip.addEventListener('pointerdown', (e) => {
      if (e.button || e.target.closest('button')) return;
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
      const end = (ok) => {
        chip.removeEventListener('pointermove', move); chip.removeEventListener('pointerup', up); chip.removeEventListener('pointercancel', cancel);
        ghost.remove(); over?.classList.remove('pp-over');
        if (ok && over) dropOn(p, over);
      };
      const up = (ev) => { move(ev); end(true); };
      const cancel = () => end(false);
      chip.addEventListener('pointermove', move); chip.addEventListener('pointerup', up); chip.addEventListener('pointercancel', cancel);
      move(e);
    });
  }
  const targetAt = (x, y) => {
    const direct = document.elementFromPoint(x, y)?.closest('.pp-target');
    if (direct && root.contains(direct)) return direct;
    let best = null, bd = NEAR;
    for (const el of root.querySelectorAll('.pp-target')) {
      if (!el.getClientRects().length) continue;   // (a folded group of Board Resources, the other view)
      const r = el.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (d < bd) { bd = d; best = el; }
    }
    return best;
  };

  function dropOn(p, el) {
    const t = el.dataset.digit != null ? digitTarget(board, p, +el.dataset.digit) : { res: resOf(el.dataset.res), index: +el.dataset.idx };
    if (!t?.res) return;
    drop(boardDrop({ port: p, res: t.res, index: t.index, assignments: assignments() }), p);
  }

  return { render };
}
