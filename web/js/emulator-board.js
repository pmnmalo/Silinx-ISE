// The Board Emulator's board (#405: out of mountEmulator in emulator.js): its interactive parts (the 7-segment
// digits, the LEDs, the switches and buttons, the character LCD, the rotary encoder, the power switch), what the board
// has that is not emulated, and the board's layout placing them.
import { h } from './dom.js';
import { vgaPins } from '/core/vga.js';
import { BOARD_LAYOUTS, makeDigit } from './emulator.js';

/** { digits, leds, powerSwitches, vgaWired } of mountEmulator (compiled(), knobEnd(), lcdView(), powered(), running(): its current values). */
/** No context menu over the emulated board: on a tablet a long press is one, and it released a push button held down
 *  (#1985). */
export const noMenu = (el) => el.addEventListener('contextmenu', (e) => e.preventDefault());

export function mountBoardParts(ctx) {
  const {
    board, title, after, bitFor, compiled, hasLcd, inVal, knobEnd, lcdView, main, manual, period, powered, refresh,
    resLabel, resOf, runCycles, running, setInputBit, setPower, sim, tip, wiring, setKnobEnd, setLcdView
  } = ctx;

  // ---- interactive parts (placed by the board layout below)
  const digits = [], leds = [];
  // (an active-low switch or button, the iCEBreaker's BTN_N: '0' when on or pressed, #2511)
  const low = (b) => !!b?.res.extra?.activeLow;
  const mkDigit = (k) => { const d = makeDigit(); digits[k] = d; return d.el; };
  const mkLed = (k, cls = 'emu-led') => { const l = h('div', { class: cls }); leds[k] = l; return l; };
  const mkSwitch = (k, cls = 'emu-sw', res = 'sw') => {
    const b = bitFor(res, k);
    const el = h('div', { class: cls, title: `${tip(res, k)} — click to toggle` });
    el.addEventListener('click', () => { const on = !el.classList.contains('on'); el.classList.toggle('on', on); setInputBit(b, on !== low(b)); if (!running()) refresh(); });
    return el;
  };
  const mkButton = (k, cls = 'emu-btn', res = 'btn') => {
    const b = bitFor(res, k);
    const el = h('div', { class: cls, title: `${tip(res, k)} — press and hold (Shift+click keeps it pressed)` });
    let latched = false;
    const set = (on) => { el.classList.toggle('on', on); setInputBit(b, on !== low(b)); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (e.shiftKey) { latched = !latched; set(latched); } else { latched = false; set(true); el.setPointerCapture(e.pointerId); } });
    el.addEventListener('pointerup', () => { if (!latched) set(false); });
    el.addEventListener('pointercancel', () => { if (!latched) set(false); });
    return el;
  };
  const portLabel = (res, k = 0) => { const b = bitFor(res, k); return b ? b.bit : '—'; };
  // character LCD: 2 x 16 cells drawn from the HD44780 model (custom characters from CGRAM)
  const mkLcd = ({ cellW = 15.5, cellH = 24, w = 12, h: ch = 19 } = {}) => {
    const el = h('div', { class: 'emu-lcd', title: hasLcd ? 'Character LCD (HD44780): lcd_e, lcd_rs, lcd_rw, lcd_d' : 'LCD: not connected in the UCF' });
    const cells = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) {
      const cell = h('div', { class: 'emu-lcd-cell', style: { left: `${c * cellW}px`, top: `${r * cellH}px`, width: `${w}px`, height: `${ch}px` } });
      cells.push(cell); el.append(cell);
    }
    setLcdView({
      set(lines, st) {
        cells.forEach((cell, i) => {
          const code = lines ? lines[i >> 4][i & 15] : 0x20;
          if (cell._code === code && !(code < 16 && lines)) return;
          cell._code = code;
          if (lines && code < 16) {   // custom character: 5x8 dots from CGRAM
            const base = (code & 7) * 8;
            let svg = '<svg viewBox="0 0 5 8" width="100%" height="100%">';
            for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) if ((st.cgram[base + y] >> (4 - x)) & 1) svg += `<rect x="${x}" y="${y}" width=".9" height=".9" fill="#1c2a08"/>`;
            cell.innerHTML = `${svg}</svg>`;
          } else cell.textContent = code === 0x20 ? '' : (code === 0x5c ? '¥' : code === 0x7e ? '→' : code === 0x7f ? '←' : String.fromCharCode(code));
        });
      },
    });
    return el;
  };
  // rotary encoder (ROT_A / ROT_B in quadrature, at rest both '1'): one detent per click / wheel step
  const QUAD_CYCLES = 1000;
  const turnKnob = (dir) => {
    const a = bitFor('rot_a'), b = bitFor('rot_b');
    if (!a || !b) return;
    const seq = dir > 0 ? [[0, 1], [0, 0], [1, 0], [1, 1]] : [[1, 0], [0, 0], [0, 1], [1, 1]];   // clockwise: A leads
    // turns queue up: a click while the previous detent is still being played (the emulator is
    // slower than the clicks) must not interleave the two quadrature sequences
    const t0 = Math.max(sim.now, knobEnd());
    if (compiled()) {
      // (the worker sets the bits, from its own time: the page's may be a run behind; data, not a function;
      // the page's copy of the inputs where the knob rests)
      const bitSet = (x, v) => ({ sig: x.sig, value: BigInt(v) << BigInt(x.pos), mask: 1n << BigInt(x.pos) });
      sim.sequence(seq.map(([va, vb], k) => ({ dt: (k + 1) * QUAD_CYCLES * period, sets: [bitSet(a, va), bitSet(b, vb)] })));
      for (const [x, v] of [[a, seq.at(-1)[0]], [b, seq.at(-1)[1]]]) { const m = 1n << BigInt(x.pos), cur = inVal.get(x.sig) ?? 0n; inVal.set(x.sig, v ? cur | m : cur & ~m); }
    } else seq.forEach(([va, vb], k) => sim.at(t0 + (k + 1) * QUAD_CYCLES * period, () => { setInputBit(a, va); setInputBit(b, vb); }));
    setKnobEnd(t0 + seq.length * QUAD_CYCLES * period);
    if (!running()) after(runCycles(Math.ceil((knobEnd() - sim.now) / period) + QUAD_CYCLES));
  };
  const mkRotary = () => {
    const el = h('div', { class: 'emu-rot', title: bitFor('rot_a') ? 'Turn the knob: ⟲ / ⟳ or the mouse wheel (ROT_A / ROT_B)' : 'Rotary encoder: ROT_A / ROT_B not connected in the UCF' },
      h('button', { class: 'emu-rot-btn', title: 'Turn left (counter-clockwise)', onclick: () => turnKnob(-1) }, '⟲'),
      h('button', { class: 'emu-rot-btn', title: 'Turn right (clockwise)', onclick: () => turnKnob(1) }, '⟳'));
    return el;
  };

  // the power switch: off stops the board (LEDs, displays and LCD dark); on starts the design again
  // from time 0, as configuring the FPGA at power-up does
  const powerSwitches = [];
  const mkPower = () => {
    const el = h('div', { class: 'emu-power on', role: 'switch', tabindex: '0', 'aria-checked': 'true', 'aria-label': 'Power', title: 'Power switch: click to turn the board off / on' },
      h('div', { class: 'emu-power-sw' }), h('div', { class: 'emu-power-led' }));
    el.addEventListener('click', () => setPower(!powered()));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPower(!powered()); } });
    powerSwitches.push(el);
    return el;
  };
  const vgaWired = vgaPins(wiring, board);
  const notEmulated = board.resources.filter((r) => !['led', 'sw', 'btn', 'seg', 'dp', 'an', 'rot'].includes(wiring.bits.find((b) => b.res === r)?.kind) && r.group !== 'Clock'
    && !(r.group === 'LCD' && BOARD_LAYOUTS[board.id]?.lcd) && !(r.group === 'VGA' && vgaWired && compiled())
    && wiring.bits.some((b) => b.res === r)).map((r) => r.name);
  const clockNote = (wiring.clocks.length ? `Clock ${wiring.clocks.map((c) => c.port).join(', ')}: ${1e6 / period} MHz on the board${wiring.clocks[0].guessed ? ' (not in the UCF: assumed)' : ''}`
    : manual.length ? `Manual clock ${manual.map((b) => `${b.port} (${b.res.name.toUpperCase()})`).join(', ')}: one edge per press` : 'No clock input found')
    + (notEmulated.length ? ` · not emulated: ${notEmulated.join(', ')}` : '');

  const layout = BOARD_LAYOUTS[board.id];
  if (layout) main.append(layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkLcd, mkRotary, turnKnob, mkPower }));
  else {
    // generic board: rows of displays, LEDs, switches and buttons
    const boardEl = h('div', { class: 'emu-board' }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' } },
      h('h3', { style: { margin: 0 } }, `${board.name}${title ? ` — ${title}` : ''}`), h('span', { class: 'emu-silk' }, 'POWER'), mkPower()));
    noMenu(boardEl);
    main.append(boardEl);
    const cell = (kind, idx, widget) => h('div', { class: `emu-cell${bitFor(kind, idx) ? '' : ' nc'}`, title: tip(kind, idx) },
      widget, h('span', { class: 'res' }, `${resLabel[kind] || kind}${idx}`), h('span', { class: 'port' }, portLabel(kind, idx)));
    const row = (res, kind, mk) => {
      const r = resOf(res);
      if (!r) return;
      const el = h('div', { class: 'emu-row' });
      for (let k = r.pins.length - 1; k >= 0; k--) el.append(cell(kind, k, mk(k)));
      boardEl.append(el);
    };
    if (resOf('an') && resOf('seg')) {
      const disp = h('div', { class: 'emu-disp' });
      for (let k = resOf('an').pins.length - 1; k >= 0; k--) disp.append(cell('an', k, mkDigit(k)));
      boardEl.append(h('div', { class: 'emu-row' }, disp));
    }
    row('led', 'led', (k) => mkLed(k));
    row('sw', 'sw', (k) => mkSwitch(k));
    row('btn', 'btn', (k) => mkButton(k));
    const others = board.resources.filter((r) => r.name !== 'btn' && (/^btn_/.test(r.name) || r.name === 'rot_center'));
    if (others.length) boardEl.append(h('div', { class: 'emu-row' }, ...others.map((r) => h('div', { class: `emu-cell${bitFor(r.name) ? '' : ' nc'}`, title: tip(r.name) },
      mkButton(0, 'emu-btn', r.name), h('span', { class: 'res' }, r.name.replace(/^btn_/, '').toUpperCase()), h('span', { class: 'port' }, portLabel(r.name))))));
    boardEl.append(h('div', { style: { fontSize: '11px', color: '#cfe8d4', marginTop: '6px' } }, clockNote));
  }

  return { digits, leds, powerSwitches, vgaWired };
}
