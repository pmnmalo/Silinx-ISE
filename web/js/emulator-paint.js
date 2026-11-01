// The Board Emulator's painting (#405: out of mountEmulator in emulator.js): what the board shows drawn from the last
// run (the LEDs' brightness, the digits, the LCD, the VGA picture), the watched signals' values, the status line (the
// time, the cycles, the rate against real time) and the simulator's messages in the log.
import * as V from '/core/values.js';
import { formatTime } from '/core/interp.js';
import { h } from './dom.js';
import { lcdText } from '/core/emulate.js';

/** { paint, setStat } of mountEmulator (compiled(), dirty(), lcd(), lcdDirty(), lcdView(), logN(), paints(), powered(), prev(), rateWin(), running(), vgaView(): its current values). */
// an LED's colour at brightness v (0..1): green, or red (data-colour="red": the iCEBreaker's LED1 and LEDR_N, #2511)
const ledColour = (v, red) => (red ? [58 + 197 * v, 27 + 20 * v, 27 + 20 * v] : [27 + 20 * v, 58 + 197 * v, 35 + 40 * v]).map(Math.round);
// (the status line's rewrites while running: twice a second at most, #1106)
const STAT_MS = 500;

export function mountEmuPaint(ctx) {
  const {
    compiled, digits, dirty, lcd, lcdDirty, lcdView, leds, logEl, logN, paints, period, powered, prev, rateWin, running,
    shown, sim, stat, vgaView, watched, setDirty, setPaints, setLcdDirty, setRateWin, setLogN
  } = ctx;

  const setStat = (t) => { if (stat.textContent !== t) stat.textContent = t; };
  // (while it runs, the line rewritten STAT_MS apart at most: every frame, its figures changed too fast to be read, #1106)
  let statAt = -Infinity;
  // (each LED's style written only when its brightness changed: the glow is a repaint)
  const ledShown = [];
  function paint() {
    if (!dirty() || !shown()) return;
    setDirty(false);
    setPaints(paints() + 1);
    // no window run yet (start-up, power cycle): LEDs and digits dark
    leds.forEach((l, k) => {
      const v = prev()?.leds[k] ?? 0, red = l.dataset.colour === 'red';
      const background = `rgb(${ledColour(v, red).join()})`;
      if (ledShown[k] === background) return;
      ledShown[k] = background;
      l.style.background = background; l.style.boxShadow = v > 0.05 ? `0 0 ${Math.round(8 * v)}px ${red ? '#f44' : '#4f4'}` : 'none';
    });
    digits.forEach((d, k) => d && d.set(prev()?.digits[k] ?? null));
    if (lcdView() && lcdDirty()) { lcdView().set(powered() ? lcdText(lcd()) : null, lcd()); setLcdDirty(false); }
    vgaView()?.draw();
    for (const w of watched) {
      const v = compiled() ? sim.value(w.s) : w.s.val;
      const t = v == null || Array.isArray(v) ? '?' : (w.s.t?.w > 1 ? `${V.toBin(v)}${v.x ? '' : ` (${v.v.toString(16).toUpperCase()}h)`}` : (v.x ? 'X' : v.v.toString()));
      if (w.val.textContent !== t) w.val.textContent = t;
    }
    const nowMs = performance.now();
    if (nowMs - rateWin().t > 1000) { rateWin().rate = rateWin().cyc * 1000 / (nowMs - rateWin().t); setRateWin({ t: nowMs, cyc: 0, rate: rateWin().rate }); }
    const r = running() ? rateWin().rate : 0;
    if (!powered()) { setStat('Power off'); statAt = -Infinity; return; }
    if (running() && sim.finished !== 'error' && nowMs - statAt < STAT_MS) { logLines(); return; }
    statAt = running() ? nowMs : -Infinity;
    setStat(`t = ${formatTime(sim.now)} · ${Math.round(sim.now / period).toLocaleString()} cycles${running() ? ` · ${r >= 1000 ? `${(r / 1000).toFixed(1)} kHz` : `${Math.round(r)} Hz`} (${(r * period / 1e10).toFixed(r * period / 1e10 < 1 ? 3 : 1)}% of real time)` : ''}${sim.finished === 'error' ? ' · stopped by an error' : ''}`);
    logLines();
  }
  // the simulator's messages, new ones into the log
  function logLines() {
    const log = sim.log;
    if (log.length !== logN()) {
      for (const e of log.slice(Math.max(logN(), log.length - 50))) logEl.append(h('div', { class: e.kind }, `${formatTime(e.time)}  ${e.kind === 'print' ? '' : `${e.kind.toUpperCase()}: `}${e.text}`));
      setLogN(log.length);
      while (logEl.childElementCount > 200) logEl.firstChild.remove();
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  return { paint, setStat };
}
