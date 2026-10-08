import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, VERSION } from '../core/version.js';

test('compareVersions orders releases numerically', () => {
  assert.ok(compareVersions('15.10.0', '15.9.9') > 0);
  assert.ok(compareVersions('v15.3.0', '15.3.0') === 0);
  assert.ok(compareVersions('15.3', '15.3.1') < 0);
  assert.ok(compareVersions('16.0.0', VERSION) > 0);
});
