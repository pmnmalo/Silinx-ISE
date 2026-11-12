// A test run never writes the user's own configuration (#3420): runs had written placeholder ssh settings (host, user,
// port, settings script) into the developer's ~/.silinx/config.json. server/toolchain.js refuseUserConfigInTests: under
// node --test (or a *.test.js file run alone) saveConfig refuses the account's own ~/.silinx, whatever HOME says.
// The user's own configuration is never read here: its folder's path is compared, its file only stat'ed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { refuseUserConfigInTests } = await import('../server/toolchain.js');
const MESSAGE = /a test run does not write the user's own configuration \(.*config\.json\): set SILINX_CONFIG_DIR to a temporary folder$/;
let tmp;

before(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'silinx-config-isolation-')); });
after(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

test('#3420 a test run refuses the account\'s own configuration folder, whatever HOME says', () => {
  const own = path.join(os.userInfo().homedir, '.silinx');
  for (const ctx of [{ env: { NODE_TEST_CONTEXT: 'child-v8' }, execArgv: [] }, { env: {}, execArgv: ['--test', '--test-isolation=none'] },
    { env: {}, execArgv: [], script: path.join(ROOT, 'test', 'build-settings.test.js') }])
    assert.throws(() => refuseUserConfigInTests({ script: '', ...ctx, dir: own }), MESSAGE);
  // the same folder by another spelling
  assert.throws(() => refuseUserConfigInTests({ env: { NODE_TEST_CONTEXT: 'child' }, dir: path.join(own, '..', '.silinx') }), MESSAGE);
});

test('#3420 a temporary folder, a run that is no test, or SILINX_TEST_REAL_CONFIG=1: allowed', () => {
  const own = path.join(os.userInfo().homedir, '.silinx');
  assert.equal(refuseUserConfigInTests({ env: { NODE_TEST_CONTEXT: 'child-v8' }, dir: path.join(tmp, 'cfg') }), undefined);
  assert.equal(refuseUserConfigInTests({ env: { NODE_TEST_CONTEXT: 'child-v8' }, dir: path.join(tmp, 'home', '.silinx') }), undefined);
  assert.equal(refuseUserConfigInTests({ env: {}, execArgv: [], script: path.join(ROOT, 'bin', 'silinx.js'), dir: own }), undefined);
  assert.equal(refuseUserConfigInTests({ env: { NODE_TEST_CONTEXT: 'child-v8', SILINX_TEST_REAL_CONFIG: '1' }, dir: own }), undefined);
});

test('#3420 this test run\'s configuration is a temporary one or none (the guard is active here)', () => {
  assert.ok(process.env.NODE_TEST_CONTEXT || process.execArgv.includes('--test') || /\.test\.js$/.test(process.argv[1]), 'a test run');
  assert.notEqual(process.env.SILINX_TEST_REAL_CONFIG, '1');
});

// end to end, in a child whose account's home is a temporary folder (os.userInfo stubbed): even a broken guard
// writes nothing outside it
test('#3420 saveConfig with ssh settings under a test run: refused, the account\'s config.json not written', () => {
  const home = path.join(tmp, 'account'), own = path.join(home, '.silinx');
  fss.mkdirSync(own, { recursive: true });
  const stub = path.join(tmp, 'stub-home.mjs');
  fss.writeFileSync(stub, `import os from 'node:os';\nconst u = os.userInfo;\nos.userInfo = (...a) => ({ ...u(...a), homedir: ${JSON.stringify(home)} });\n`);
  const real = path.join(os.userInfo().homedir, '.silinx', 'config.json');
  const stamp = () => { try { const s = fss.statSync(real); return `${s.mtimeMs} ${s.size}`; } catch { return 'none'; } };
  const before = stamp();
  const script = `const tc = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'server', 'toolchain.js')).href)});
    try { await tc.saveConfig({ mode: 'ssh', ssh: { host: 'buildbox', user: 'u', port: 22, settings: '/opt/Xilinx/14.7/ISE_DS/settings64.sh' } }); console.log('saved'); }
    catch (e) { console.log(e.message); }`;
  const run = extra => spawnSync(process.execPath, ['--import', pathToFileURL(stub).href, '--input-type=module', '-e', script],
    { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, NODE_TEST_CONTEXT: 'child-v8', ...extra } });
  // HOME is the account's home, no SILINX_CONFIG_DIR: refused
  let r = run({});
  assert.match(r.stdout.trim(), MESSAGE, r.stderr);
  assert.ok(!fss.existsSync(path.join(own, 'config.json')), 'nothing written');
  // SILINX_CONFIG_DIR naming it: refused all the same
  r = run({ SILINX_CONFIG_DIR: own });
  assert.match(r.stdout.trim(), MESSAGE, r.stderr);
  assert.ok(!fss.existsSync(path.join(own, 'config.json')), 'nothing written');
  // a temporary folder of its own: saved there
  r = run({ SILINX_CONFIG_DIR: path.join(tmp, 'cfg') });
  assert.equal(r.stdout.trim(), 'saved', r.stderr);
  assert.equal(JSON.parse(fss.readFileSync(path.join(tmp, 'cfg', 'config.json'), 'utf8')).ssh.host, 'buildbox');
  // the user's own configuration: untouched (its time and size only, never its content)
  assert.equal(stamp(), before);
});
