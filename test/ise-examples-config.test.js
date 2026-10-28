// The configuration test/ise/examples.test.js builds the examples with over ssh (#1916): a folder of its own in the
// folder Docker shares on the ISE machine (SILINX_ISE_REMOTE_DIR, else the user's ssh.remoteDir), read before the test
// replaces the user's configuration; never a folder of the remote home Docker does not share ("Mounts denied").
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iseExamplesConfig, ISE_SETTINGS } from './ise-examples-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'xilinx/ise:14.7';
const HOST = { user: 'me', host: 'build-box' };
let tmp, saved;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ise-cfg-')); saved = process.env.SILINX_CONFIG_DIR; });
after(() => {
  if (saved === undefined) delete process.env.SILINX_CONFIG_DIR; else process.env.SILINX_CONFIG_DIR = saved;
  fs.rmSync(tmp, { recursive: true, force: true });
});
function userConfig(ssh) {
  const dir = fs.mkdtempSync(path.join(tmp, 'cfg-'));
  if (ssh) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ mode: 'ssh', ssh }));
  process.env.SILINX_CONFIG_DIR = dir;
}
const remoteDir = env => iseExamplesConfig({ host: HOST, image: IMAGE, env }).ssh.remoteDir;

test('over ssh: a folder of its own in the configured remoteDir (the folder Docker shares on the host)', () => {
  userConfig({ host: 'x', remoteDir: '/Users/Shared/silinx-ise/build' });
  assert.equal(remoteDir({}), '/Users/Shared/silinx-ise/build/silinx-ise-examples');
  userConfig({ host: 'x', remoteDir: '~/shared/build/' });
  assert.equal(remoteDir({}), 'shared/build/silinx-ise-examples');
});

test('SILINX_ISE_REMOTE_DIR takes precedence over the configuration', () => {
  userConfig({ host: 'x', remoteDir: '/Users/Shared/silinx-ise/build' });
  assert.equal(remoteDir({ SILINX_ISE_REMOTE_DIR: '/srv/ise/' }), '/srv/ise/silinx-ise-examples');
});

test('no configuration, or one with no remoteDir: ~/silinx-ise-examples, as before', () => {
  userConfig(null);
  assert.equal(remoteDir({}), 'silinx-ise-examples');
  userConfig({ host: 'x' });
  assert.equal(remoteDir({}), 'silinx-ise-examples');
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), '{ not json');
  assert.equal(remoteDir({}), 'silinx-ise-examples');
});

test('the rest of the ssh configuration, and the image on this machine', () => {
  userConfig(null);
  assert.deepEqual(iseExamplesConfig({ host: HOST, image: IMAGE, env: {} }),
    { mode: 'ssh', ssh: { host: 'build-box', user: 'me', remoteDir: 'silinx-ise-examples', image: IMAGE, settings: ISE_SETTINGS } });
  assert.equal(iseExamplesConfig({ host: { host: 'build-box' }, image: IMAGE, env: {} }).ssh.user, '');
  assert.deepEqual(iseExamplesConfig({ host: null, image: IMAGE, env: {} }),
    { mode: 'docker', docker: { image: IMAGE, platform: 'linux/amd64', settings: ISE_SETTINGS } });
});

test('test/ise/examples.test.js takes its configuration from the helper, before it replaces the user\'s (regression #1916)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'test/ise/examples.test.js'), 'utf8');
  assert.doesNotMatch(src, /remoteDir:\s*'/, 'no remoteDir written in the test');
  const helper = src.indexOf('iseExamplesConfig({'), redirect = src.indexOf('process.env.SILINX_CONFIG_DIR =');
  assert.ok(helper > 0 && redirect > 0, 'the helper is called and the configuration redirected');
  assert.ok(helper < redirect, 'the user\'s remoteDir is read before SILINX_CONFIG_DIR points at the test\'s configuration');
});
