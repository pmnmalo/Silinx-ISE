// test/ui/interface.js: the interface the UI tests run in (SILINX_UI_INTERFACE), the ids of before mapped with a
// warning (#2451).
import test from 'node:test';
import assert from 'node:assert/strict';
import { uiInterface, UI_INTERFACES, LEGACY_UI_INTERFACES } from './ui/interface.js';
import { INTERFACES, LEGACY_INTERFACES } from '../web/js/modern.js';

test('#2451 SILINX_UI_INTERFACE: silinx or ise as they are, unset the default, no warning', () => {
  const warnings = [];
  for (const v of ['silinx', 'ise', ' ise ']) assert.equal(uiInterface(v, (m) => warnings.push(m)), v.trim());
  for (const v of [undefined, null, '']) assert.equal(uiInterface(v, (m) => warnings.push(m)), '');
  assert.deepEqual(warnings, []);
});

test('#2451 SILINX_UI_INTERFACE=modern|classic: mapped to silinx|ise, with a warning', () => {
  const warnings = [];
  assert.equal(uiInterface('modern', (m) => warnings.push(m)), 'silinx');
  assert.equal(uiInterface('classic', (m) => warnings.push(m)), 'ise');
  assert.deepEqual(warnings, [
    "SILINX_UI_INTERFACE=modern is the id of before #2451: running in 'silinx' (write SILINX_UI_INTERFACE=silinx)",
    "SILINX_UI_INTERFACE=classic is the id of before #2451: running in 'ise' (write SILINX_UI_INTERFACE=ise)",
  ]);
});

test('#2451 SILINX_UI_INTERFACE: an unknown interface is an error, not the default', () => {
  for (const v of ['tasks', 'Silinx', 'constructor']) {
    assert.throws(() => uiInterface(v, () => assert.fail('no warning')), new RegExp(`^Error: SILINX_UI_INTERFACE=${v}: not an interface \\(silinx or ise\\)$`));
  }
});

test('#2451 the tests\' interfaces and their ids of before are the app\'s', () => {
  assert.deepEqual(UI_INTERFACES, INTERFACES);
  assert.deepEqual({ ...LEGACY_UI_INTERFACES }, { ...LEGACY_INTERFACES });
});
