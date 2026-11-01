// UI: the device picker (#405: web/js/device-picker.js, out of web/js/wizards.js), mounted alone on the device
// database: the family's parts, the part's packages and speed grades, a choice cascading, set and disable.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#405 the device picker, alone: the cascade Family > Device > Package > Speed, set, disable', E, async (page) => {
  const r = await page.eval(async () => {
    const { devicePicker } = await import('/js/device-picker.js');
    const db = await (await fetch('/api/devices')).json();
    const dp = devicePicker(db, { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });
    const opts = s => [...s.options].map(o => o.value);
    const first = { value: dp.value(), parts: opts(dp.partSel), pkgs: opts(dp.pkgSel), speeds: opts(dp.spdSel), name: dp.familyName() };
    dp.famSel.value = 'spartan6'; dp.famSel.dispatchEvent(new Event('change'));
    const s6 = dp.value();
    dp.set({ family: 'spartan3e', part: 'xc3s500e', package: 'fg320', speed: '-5' });
    const set = dp.value();
    dp.disable(true);
    return { first, s6, set, disabled: [dp.famSel, dp.partSel, dp.pkgSel, dp.spdSel].map(e => e.disabled) };
  });
  assert.deepEqual(r.first.value, { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });
  assert.deepEqual(r.first.parts, ['xc3s100e', 'xc3s250e', 'xc3s500e', 'xc3s1200e', 'xc3s1600e']);
  assert.deepEqual(r.first.pkgs, ['vq100', 'cp132', 'tq144', 'pq208', 'ft256']);
  assert.deepEqual(r.first.speeds, ['-4', '-5']);
  assert.equal(r.first.name, 'Spartan-3E');
  assert.equal(r.s6.family, 'spartan6');
  assert.match(r.s6.part, /^xc6s/);
  assert.equal(r.s6.speed, '-2', 'a standard grade, not the low-power one');
  assert.deepEqual(r.set, { family: 'spartan3e', part: 'xc3s500e', package: 'fg320', speed: '-5' });
  assert.deepEqual(r.disabled, [true, true, true, true]);
});
