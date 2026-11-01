// The Board Emulator's VGA monitor and side panel (#405: out of mountEmulator in emulator.js): the picture the design
// scans out on the VGA connector (#420), the signals watched, the ports on no pin of the board, and the log with
// why the engine runs the design as it does.
import { h } from './dom.js';
import { vgaPixels } from '/core/vga.js';

/** { logEl, watched } of mountEmulator (compiled(), engineNote(), powered(), running(), vgaView(): its current values). */
export function mountEmuSide(ctx) {
  const {
    board, design, engine, timing, title, after, clockSigs, compiled, engineNote, main, powered, refresh, running, sim,
    vgaView, vgaWired, wiring, setVgaView
  } = ctx;

  if (vgaWired) {
    const canvas = h('canvas', { width: 640, height: 480 });
    const nosig = h('div', { class: 'emu-vga-nosig' }, compiled() ? 'No signal' : 'The VGA monitor needs the compiled engine (the event-driven one is too slow for a frame)');
    const statEl = h('div', { class: 'emu-vga-stat' }), warnEl = h('div', { class: 'emu-vga-warn' });
    const box = h('div', { class: 'emu-box emu-vga', 'data-module': 'vga' }, h('h4', {}, 'VGA monitor (640×480)'), h('div', { class: 'emu-vga-frame' }, canvas, nosig), statEl, warnEl);
    main.append(box);
    const shown = () => box.style.display !== 'none';   // (hidden, #2522: no picture fetched or drawn)
    const ctx = canvas.getContext('2d');
    const img = ctx?.createImageData(640, 480), px = img ? new Uint32Array(img.data.buffer) : null;
    let drawn = 0, warned = '';
    const dark = () => { ctx?.clearRect(0, 0, 640, 480); nosig.hidden = false; statEl.textContent = ''; if (warned) { warnEl.textContent = ''; warned = ''; } };
    setVgaView({
      shown,
      draw() {
        if (!shown()) return;
        if (!compiled() || !powered()) { dark(); return; }
        const v = sim.vga();
        if (!v?.status.signal || !v.fb) { dark(); return; }
        const now = performance.now();
        if (now - drawn < 33 && running()) return;   // (30 pictures a second at most)
        drawn = now;
        nosig.hidden = true;
        if (px) { vgaPixels(v.fb, v.palette, px); ctx.putImageData(img, 0, 0); }
        statEl.textContent = `640×480 · ${v.status.summary}`;
        const w = v.status.warnings.join('\n');
        if (w !== warned) { warned = w; warnEl.replaceChildren(...v.status.warnings.map((t) => h('div', {}, t))); }
      },
    });
  }

  // side: watch, unconnected ports, log
  const side = h('div', { class: 'emu-side' });
  main.append(side);
  const watchBody = h('tbody');
  const watched = [];
  const sigSel = h('select', { style: { maxWidth: '100%' } }, h('option', { value: '' }, 'Add a signal to watch…'),
    ...design.signals.filter((s) => !Array.isArray(s.init) && s.t?.kind !== 'str').map((s, i) => h('option', { value: String(i) }, s.path || s.name)));
  const sigList = design.signals.filter((s) => !Array.isArray(s.init) && s.t?.kind !== 'str');
  sigSel.addEventListener('change', () => {
    const s = sigList[Number(sigSel.value)];
    sigSel.value = '';
    if (!s || watched.some((w) => w.s === s)) return;
    const val = h('td', { style: { textAlign: 'right' } });
    const tr = h('tr', {}, h('td', {}, s.path || s.name), val,
      h('td', {}, h('a', { href: '#', title: 'Remove', onclick: (e) => { e.preventDefault(); tr.remove(); watched.splice(watched.findIndex((w) => w.s === s), 1); watchChanged(); } }, '✕')));
    watched.push({ s, val });
    watchBody.append(tr);
    watchChanged();
  });
  // (the compiled engine: the worker sends the watched signals' values with each run; paused, a run of no cycle)
  function watchChanged() {
    if (!compiled()) { refresh(); return; }
    sim.watch(watched.map((w) => w.s));
    if (!running()) after(sim.advance(0));
  }
  side.append(h('div', { class: 'emu-box' }, h('h4', {}, 'Watch'), sigSel, h('table', {}, watchBody)));
  if (timing?.gens?.length) {
    const used = new Map((design.top.params || []).map((p) => [p.name, Number(p.value?.v ?? 0)]));
    side.append(h('div', { class: 'emu-box' }, h('h4', {}, timing.scale > 1 ? `Timing ÷${timing.scale.toLocaleString()} (emulation only)` : 'Timing generics'),
      h('table', {}, h('tbody', {}, ...timing.gens.map((g) => h('tr', {}, h('td', {}, g.name), h('td', { style: { textAlign: 'right' } }, g.value.toLocaleString()),
        h('td', { style: { textAlign: 'right' } }, timing.scale > 1 ? `→ ${(used.get(g.name) ?? 0).toLocaleString()}` : ''))))),
      h('div', { class: 'emu-hint', style: { marginTop: '4px' } }, timing.scale > 1
        ? 'Divided so that counters, dividers and debouncers advance at the emulator\'s speed (about 10^5 clock cycles per second instead of 50 MHz). The design and the bitstream are not changed.'
        : compiled() ? 'Real values: the compiled engine runs the design at up to the board\'s clock rate.'
          : 'Real values: at the emulator\'s speed, a design that counts millions of cycles moves very slowly.')));
  }
  const unm = wiring.unmapped.filter((u) => !clockSigs.has(design.top.ports.find((p) => p.name === u.port)?.sig));
  if (unm.length) {
    side.append(h('div', { class: 'emu-box' }, h('h4', {}, 'Not on the board'),
      h('div', { class: 'emu-hint' }, `${unm.length} port bit(s) have no LOC on a ${board.name} resource (inputs are held at 0): `),
      h('div', { style: { fontFamily: 'var(--mono, monospace)', marginTop: '4px' } }, unm.map((u) => `${u.bit}${u.loc ? ` (${u.loc})` : ''}`).join(', '))));
  }
  const logEl = h('div', { class: 'emu-log' });
  side.append(h('div', { class: 'emu-box' }, h('h4', {}, 'Messages'), logEl));
  side.append(h('div', { class: 'emu-hint' }, compiled()
    ? 'The design is compiled (its netlist, by Yosys) and runs at up to the board\'s clock rate; registers without an initial value start at 0, as on the FPGA; '
      + 'the event-driven engine shows X values and the design\'s messages. Each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board. '
      + 'Buttons: press and hold; Shift+click keeps a button pressed.'
    : 'The design is simulated from its HDL (behavioural RTL) at a reduced clock rate; registers without an initial value start at 0, as on the FPGA; '
      + 'each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board. Buttons: press and hold; Shift+click keeps a button pressed.'));
  // why the event-driven engine runs it (the design could not be compiled), what the compiled one warns of
  if (engineNote()) side.append(h('div', { class: 'emu-hint' }, `Not compiled (${engineNote()}): the event-driven simulator runs the design.`));
  else if (engine?.auto && !compiled()) side.append(h('div', { class: 'emu-hint emu-engine-auto' }, `The event-driven engine by default on this device (${engine.auto}): choose Engine ▸ Compiled to run the design at the board's real speed.`));
  for (const w of compiled()?.warnings || []) side.append(h('div', { class: 'emu-hint' }, `Compiled engine: ${w}`));

  return { logEl, watched };
}
