// UI: the Board Emulator prints (#1512): the board as shown, its LEDs, displays and switches in their current state, its
// Watch and the emulation's time, without its commands, hints and messages; one page, the project and the module named.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { capturePrints, confirmPrint, printOn, printed } from './print-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#1512 the Board Emulator prints the board in its current state, the Watch and the time', E, async (page) => {
  await makeProject(env, { name: 'PrEmu', template: 'blinky' });
  await page.openProject('PrEmu');
  await capturePrints(page);
  await page.eval(async () => (await import('/js/viewers.js')).openEmulator(window.Silinx.project.top));
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view && document.querySelector('.doc:not([hidden]) .emu-sw'), [], { what: 'the Board Emulator', timeout: 60000 });
  // a switch up, a signal watched, then paused (its state still)
  await page.eval(() => {
    document.querySelector('.doc:not([hidden]) .emu-sw').click();
    const sel = document.querySelector('.doc:not([hidden]) .emu-side select');
    sel.value = [...sel.options].find((o) => /\bsw$/.test(o.textContent)).value;
    sel.dispatchEvent(new Event('change'));
    window.Silinx.active.view.pause();
  });
  // (paused: the time without the rate, and still: a run the worker began before the pause ends after it, #1558)
  await page.waitFor(() => {
    const t = document.querySelector('.doc:not([hidden]) .stat').textContent, now = Date.now(), w = window.__emuTime;
    if (!/^t = .* cycles$/.test(t) || w?.t !== t) { window.__emuTime = { t, at: now }; return false; }
    return now - w.at >= 1000;
  }, [], { what: 'the time, paused and still' });
  const live = await page.eval(() => ({
    time: document.querySelector('.doc:not([hidden]) .stat').textContent,
    sw: [...document.querySelectorAll('.doc:not([hidden]) .emu-sw')].map((e) => e.className),
    leds: document.querySelectorAll('.doc:not([hidden]) .emu-led').length,
  }));
  assert.ok(await printOn(page));
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page);
  const html = await printed(page, 1);
  assert.match(html, /<header class="pv-head"><b>Board Emulator \(top\)<\/b><span>Project: PrEmu<\/span><\/header>/);
  assert.match(html, /^<html data-ui="\w+" data-theme="light"/);
  assert.ok(html.includes(`<p class="pv-emu-time">${live.time}</p>`), live.time);
  const body = html.slice(html.indexOf('<main'));
  // the board: its switches as they are (the first one up), its LEDs, its displays; the Watch and its signal
  assert.deepEqual([...body.matchAll(/<div class="(emu-sw[^"]*)"/g)].map((m) => m[1]), live.sw);
  assert.ok(live.sw.some((c) => /\bon\b/.test(c)), live.sw.join());
  assert.equal((body.match(/<div class="emu-led/g) || []).length, live.leds);
  assert.match(body, /class="emu-pcb"/);
  assert.match(body, /<h4>Watch<\/h4>/);
  assert.match(body, /<td>top\.sw<\/td>/);
  // not its commands, hints or messages
  assert.doesNotMatch(body, /class="emu-bar"|<select|class="emu-hint|class="emu-log"|>Messages<|class="stat"/);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
