// The Board Emulator's engine by default (#952, core/emulate-engine.js): the event-driven one on a slow device
// (a phone or tablet, fewer than 4 cores, less than 4 GB of memory), the compiled one elsewhere; the user's
// remembered choice wins; a missing API says nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slowDevice, defaultEngine, ENGINE_KEY } from '../core/emulate-engine.js';

// real browsers' navigators (the parts the rule reads)
const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
};
const FAST = {
  'Windows desktop, Chrome': { userAgent: UA.winChrome, hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, userAgentData: { mobile: false } },
  'Windows laptop with a touch screen': { userAgent: UA.winChrome, hardwareConcurrency: 4, deviceMemory: 4, maxTouchPoints: 10, userAgentData: { mobile: false } },
  'Mac, Safari (no deviceMemory, no userAgentData)': { userAgent: UA.macSafari, hardwareConcurrency: 8, maxTouchPoints: 0 },
  'Linux, Firefox (no deviceMemory)': { userAgent: UA.linuxFirefox, hardwareConcurrency: 16, maxTouchPoints: 0 },
};
const SLOW = {
  'Android phone': [{ userAgent: UA.android, hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 5, userAgentData: { mobile: true } }, 'a phone or tablet'],
  'Android tablet (no "Mobile" in its User-Agent: Client Hints)': [{ userAgent: UA.androidTablet, hardwareConcurrency: 8, deviceMemory: 4, maxTouchPoints: 10, userAgentData: { mobile: true } }, 'a phone or tablet'],
  iPhone: [{ userAgent: UA.iphone, hardwareConcurrency: 6, maxTouchPoints: 5 }, 'a phone or tablet'],
  'iPad (iPadOS: says it is a Mac)': [{ userAgent: UA.macSafari, hardwareConcurrency: 8, maxTouchPoints: 5 }, 'a phone or tablet'],
  'iPad (old User-Agent)': [{ userAgent: UA.ipadOld, hardwareConcurrency: 2, maxTouchPoints: 5 }, 'a phone or tablet, 2 processor cores'],
  'low-end laptop: 2 cores, 2 GB': [{ userAgent: UA.winChrome, hardwareConcurrency: 2, deviceMemory: 2, maxTouchPoints: 0, userAgentData: { mobile: false } }, '2 processor cores, 2 GB of memory'],
  'one core': [{ userAgent: UA.linuxFirefox, hardwareConcurrency: 1 }, '1 processor core'],
  'Chromebook: 4 cores, 0.5 GB': [{ userAgent: UA.winChrome, hardwareConcurrency: 4, deviceMemory: 0.5 }, '0.5 GB of memory'],
};

test('slowDevice: desktops and laptops of 4 cores and 4 GB or more are not slow', () => {
  for (const [what, nav] of Object.entries(FAST)) assert.equal(slowDevice(nav), null, what);
});

test('slowDevice: phones, tablets, few cores or little memory are, and it says why', () => {
  for (const [what, [nav, why]] of Object.entries(SLOW)) assert.equal(slowDevice(nav), why, what);
});

test('slowDevice: a missing API (or a navigator with none, or none at all) says nothing', () => {
  assert.equal(slowDevice({}), null);
  assert.equal(slowDevice(null), null);
  assert.equal(slowDevice({ userAgent: undefined, hardwareConcurrency: undefined, deviceMemory: undefined }), null);
  // nonsense values are ignored, not taken for a slow device
  assert.equal(slowDevice({ hardwareConcurrency: 0, deviceMemory: 0 }), null);
  assert.equal(slowDevice({ hardwareConcurrency: NaN, deviceMemory: '2' }), null);
  assert.equal(slowDevice({ userAgent: 42, userAgentData: null, maxTouchPoints: undefined }), null);
  // the boundaries: 4 cores and 4 GB are enough; a Mac with no touch screen is a Mac
  assert.equal(slowDevice({ hardwareConcurrency: 4, deviceMemory: 4 }), null);
  assert.equal(slowDevice({ hardwareConcurrency: 3 }), '3 processor cores');
  assert.equal(slowDevice({ userAgent: UA.macSafari, maxTouchPoints: 1 }), null);
  // Node's own navigator (Node >= 21) is a server's: never a phone
  if (globalThis.navigator?.hardwareConcurrency >= 4) assert.equal(slowDevice(), null);
});

test('defaultEngine: event-driven on a slow device, compiled elsewhere; the saved choice wins', () => {
  const [phone] = SLOW['Android phone'];
  const desk = FAST['Windows desktop, Chrome'];
  assert.deepEqual(defaultEngine({ nav: desk }), { engine: 'compiled', auto: null });
  assert.deepEqual(defaultEngine({ nav: phone }), { engine: 'event', auto: 'a phone or tablet' });
  assert.deepEqual(defaultEngine({ nav: {} }), { engine: 'compiled', auto: null });
  assert.deepEqual(defaultEngine({ nav: null }), { engine: 'compiled', auto: null });
  // the user's choice, remembered
  assert.deepEqual(defaultEngine({ saved: 'compiled', nav: phone }), { engine: 'compiled', auto: null });
  assert.deepEqual(defaultEngine({ saved: 'event', nav: desk }), { engine: 'event', auto: null });
  // anything else stored is not a choice
  for (const saved of [null, '', 'fast', 'Compiled', undefined]) assert.deepEqual(defaultEngine({ saved, nav: phone }), { engine: 'event', auto: 'a phone or tablet' }, String(saved));
  assert.equal(ENGINE_KEY, 'silinx.emulator.engine');
});
