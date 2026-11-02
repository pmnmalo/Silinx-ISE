// UI: the board emulator while it is not seen (#719): by default it pauses while the page is hidden and while its
// document tab is not the active one, and goes on where it was when seen again; the "When hidden" selector keeps
// it running (remembered); paused or powered off it schedules no timers; running, it draws at most once a frame.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const COUNTER = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cnt is
  port (clk : in std_logic;
        sw  : in std_logic_vector(7 downto 0);
        led : out std_logic_vector(7 downto 0));
end cnt;
architecture rtl of cnt is
  signal q : unsigned(27 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then q <= q + 1; end if;
  end process;
  led <= std_logic_vector(q(27 downto 20)) xor sw;
end rtl;
`;

// a property of the emulator's view ('sim.now', 'held', 'paints' …)
const emu = (page, prop) => page.eval((p) => p.split('.').reduce((o, k) => o?.[k], window.SilinxApp.findDoc('emulator').view), prop);
const stat = (page) => page.eval(() => document.querySelector('.emu .stat').textContent);
const hiddenSel = '.emu-bar select[title^="What the emulator does while it is not seen"]';
async function openEmulator(page) {
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
}
// the board's time, once the run in flight (the compiled engine's worker) is in
async function settledNow(page) {
  await page.waitFor(() => !window.SilinxApp.findDoc('emulator').view.sim.busy, [], { what: 'the last run in' });
  return emu(page, 'sim.now');
}
async function advances(page, what) {
  const t = await emu(page, 'sim.now');
  await page.waitFor((t0) => window.SilinxApp.findDoc('emulator').view.sim.now > t0 + 1e9, [t], { what });
}
async function standsStill(page, what) {
  const t = await settledNow(page);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await emu(page, 'sim.now'), t, what);
}
// the page hidden (another browser tab, a minimised window) or shown again
const setHidden = (page, on) => page.eval((h) => {
  if (h) Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  else delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}, on);
// another document tab active (the HDL file's), or the emulator's again
const activate = (page, id) => page.eval((i) => window.SilinxApp.S.docs.find((d) => (i ? d.id === i : d.id !== 'emulator')).tab
  .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })), id);
// the timers and animation frames the page asks for in `ms`
const timers = (page, ms) => page.eval(async (t) => {
  const n = { timeout: 0, interval: 0, raf: 0 };
  const o = { setTimeout: window.setTimeout, setInterval: window.setInterval, requestAnimationFrame: window.requestAnimationFrame };
  window.setTimeout = function (...a) { n.timeout++; return o.setTimeout.apply(this, a); };
  window.setInterval = function (...a) { n.interval++; return o.setInterval.apply(this, a); };
  window.requestAnimationFrame = function (...a) { n.raf++; return o.requestAnimationFrame.apply(this, a); };
  await new Promise((r) => o.setTimeout.call(window, r, t));
  Object.assign(window, o);
  return n;
}, ms);

uiTest('board emulator: paused while hidden and while its document tab is not active, on again when seen; "Keep running" remembered; no timers paused (#719)', E, async (page) => {
  await makeProject(env, { name: 'EmuHidden', board: 'basys2', files: { 'src/cnt.vhd': COUNTER }, top: 'cnt' });
  await page.openProject('EmuHidden');
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true, 'every port is on a board resource');
  await page.eval(() => window.SilinxApp.openFile('src/cnt.vhd'));
  await openEmulator(page);
  assert.equal(await emu(page, 'engine'), 'compiled');
  assert.deepEqual(await page.eval((s) => { const e = document.querySelector(s); return [e.value, [...e.options].map((o) => o.textContent), e.previousSibling.textContent]; }, hiddenSel),
    ['pause', ['Pause', 'Keep running'], 'When hidden:'], 'the selector, next to the other settings; Pause by default');
  await advances(page, 'running');

  // running: at most one drawing per displayed frame (60 a second here), the frames by requestAnimationFrame, no timer
  const p0 = await emu(page, 'paints');
  const run = await timers(page, 1000);
  const paints = await emu(page, 'paints') - p0;
  assert.ok(paints > 10 && paints <= 65, `${paints} drawings in 1 s`);
  assert.ok(run.raf <= 130, `${run.raf} animation frames in 1 s`);
  assert.equal(run.interval, 0);
  assert.ok(run.timeout <= 2, `${run.timeout} timers in 1 s`);

  // its document tab not the active one: paused; active again: on from where it was (no backlog)
  await activate(page, null);
  await page.waitFor(() => window.SilinxApp.findDoc('emulator').view.held, [], { what: 'held behind another document tab' });
  await standsStill(page, 'paused behind another document tab');
  assert.match(await stat(page), /^t = .+ · [\d,]+ cycles · paused while hidden$/);
  assert.deepEqual(await timers(page, 500), { timeout: 0, interval: 0, raf: 0 }, 'no timer while held');
  const t1 = await emu(page, 'sim.now');
  await activate(page, 'emulator');
  await page.waitFor(() => !window.SilinxApp.findDoc('emulator').view.held, [], { what: 'on again' });
  await advances(page, 'running again');
  assert.ok(await emu(page, 'sim.now') - t1 < 5e12, 'the time it was held not caught up');
  assert.match(await stat(page), /% of real time\)$/);

  // the page hidden: paused; shown: on again
  await setHidden(page, true);
  await page.waitFor(() => window.SilinxApp.findDoc('emulator').view.held, [], { what: 'held while hidden' });
  await standsStill(page, 'paused while the page is hidden');
  assert.match(await stat(page), / · paused while hidden$/);
  assert.deepEqual(await timers(page, 500), { timeout: 0, interval: 0, raf: 0 }, 'no timer while hidden');
  await setHidden(page, false);
  await advances(page, 'running when shown again');

  // paused (Pause), and powered off: no timer
  await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏸ Pause' });
  await settledNow(page);
  assert.doesNotMatch(await stat(page), /real time/, 'paused: no rate');
  assert.deepEqual(await timers(page, 500), { timeout: 0, interval: 0, raf: 0 }, 'no timer while paused');
  await page.click('.doc:not([hidden]) .emu-power');
  await page.waitFor(() => !window.SilinxApp.findDoc('emulator').view.powered, [], { what: 'power off' });
  assert.deepEqual(await timers(page, 500), { timeout: 0, interval: 0, raf: 0 }, 'no timer while powered off');
  await page.click('.doc:not([hidden]) .emu-power');
  await advances(page, 'running after power on');

  // "Keep running": it simulates on while not seen (drawing nothing), and the choice is remembered
  await page.eval((s) => { const e = document.querySelector(s); e.value = 'run'; e.dispatchEvent(new Event('change')); }, hiddenSel);
  assert.equal(await page.eval(() => localStorage.getItem('silinx.emulator.hidden')), 'run');
  await activate(page, null);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await emu(page, 'held'), false);
  const p1 = await emu(page, 'paints');
  await advances(page, 'running behind another document tab');
  assert.equal(await emu(page, 'paints'), p1, 'nothing drawn while not seen');
  await activate(page, 'emulator');
  await setHidden(page, true);
  await advances(page, 'running while the page is hidden');
  assert.equal(await emu(page, 'held'), false);
  await setHidden(page, false);
  await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('emulator')));
  await openEmulator(page);
  assert.equal(await page.eval((s) => document.querySelector(s).value, hiddenSel), 'run', 'remembered');

  // in Portuguese: the selector and the status line
  await page.eval((s) => { const e = document.querySelector(s); e.value = 'pause'; e.dispatchEvent(new Event('change')); }, hiddenSel);
  await activate(page, null);
  await page.waitFor(() => window.SilinxApp.findDoc('emulator').view.held, [], { what: 'held' });
  await activate(page, 'emulator');
  await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏸ Pause' });
  await page.eval(TEXTS);
  // (the selector in the toolbar's menu, opened, #2666)
  await page.click('.doc:not([hidden]) .emu-bar .tb-more-btn');
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en');
  const en = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden]) .emu-bar')));
  await setLang('pt');
  const pt = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden]) .emu-bar')));
  for (const t of ['Quando oculto:', 'Pausa', 'Continuar a executar', '@O que o emulador faz enquanto não está à vista (outro separador do navegador, uma janela minimizada, outro separador de documento): pausa, e continua onde estava quando volta a ser mostrado, ou continua a executar'])
    assert.ok(pt.includes(t), `${t}: ${pt.join(' | ')}`);
  assert.deepEqual(untranslated(en, pt, [/^(cnt|real \(÷1\))\b/]), []);
  await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '▶ Executar' });
  await setHidden(page, true);
  await page.waitFor(() => / · em pausa enquanto oculto$/.test(document.querySelector('.emu .stat').textContent), [], { what: 'the status line in Portuguese' });
  await setHidden(page, false);
  await setLang('en');
  assert.deepEqual(page.dialogs, []);
});

uiTest('#1106 the status line while the emulator runs: rewritten twice a second at most (every frame, it flickered); at once when paused', E, async (page) => {
  await makeProject(env, { name: 'EmuStat', board: 'basys2', files: { 'src/cnt.vhd': COUNTER }, top: 'cnt' });
  await page.openProject('EmuStat');
  // (its pins set: with none the emulator asks first, #1508)
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true, 'every port is on a board resource');
  await openEmulator(page);
  await advances(page, 'running');
  // the line's rewrites over 3 s, counted where the page writes them
  const writes = await page.eval(async () => {
    const el = document.querySelector('.emu .stat');
    let n = 0;
    const mo = new MutationObserver((ms) => { n += ms.length; });
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    await new Promise((r) => setTimeout(r, 3000));
    mo.disconnect();
    return n;
  });
  assert.ok(writes >= 3 && writes <= 8, `${writes} rewrites in 3 s`);
  assert.match(await stat(page), /^t = .+ · [\d,]+ cycles · [\d.]+ k?Hz \([\d.]+% of real time\)$/);
  // Pause: the line at once, without the rate
  await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏸ Pause' });
  await page.waitFor(() => !/of real time/.test(document.querySelector('.emu .stat').textContent), [], { what: 'the paused line', timeout: 2000 });
  assert.match(await stat(page), /^t = .+ · [\d,]+ cycles$/);
});
