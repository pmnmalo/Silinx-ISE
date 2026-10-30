// The ssh of the scripts that run ISE or Vitis HLS on another machine (#2019): a connection that drops silently
// fails within about 2 minutes instead of hanging, and ise-remote.sh then says so, with the remote folder kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REMOTE = path.join(ROOT, 'packages/silinx-fpga/research/s3e-device/ise-remote.sh');
const SCRIPTS = ['scripts/hls-vitis.mjs', 'scripts/check-open-flow.mjs', 'research/synth-quality/fsm-ise.mjs',
  'test/designs-corpus/compare-ise.mjs',
  ...['s3e-route/ise-open-check.sh', 's3e-route/switching-limits.mjs', 's3e-route/dcm-timing.mjs', 's3e-device/ise-remote.sh',
    's6/ise-place-check.sh', 's6/night1-remote.sh', 's3e-bitstream/fuzz-remote.sh', 's3e-bitstream/impl-remote.sh']
    .map(f => `packages/silinx-fpga/research/${f}`)];

test('every ssh of the remote scripts has the keepalive and the connect timeout', () => {
  for (const f of SCRIPTS) {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter(l => l.includes('BatchMode=yes'));
    assert.ok(lines.length, `${f}: no ssh found`);
    for (const l of lines) {
      for (const o of ['ServerAliveInterval=30', 'ServerAliveCountMax=4', 'ConnectTimeout=30']) assert.ok(l.includes(o), `${f}: no ${o} in ${l}`);
    }
  }
});

// ise-remote.sh with an ssh and an rsync of the test's, which log their calls; the ssh answers the run with `runExit`
function runRemote(runExit) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-keepalive-'));
  const bin = path.join(tmp, 'bin'), dir = path.join(tmp, 'designs'), log = path.join(tmp, 'calls.log');
  fs.mkdirSync(bin); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'a.xdl'), '');
  fs.writeFileSync(path.join(bin, 'ssh'), `#!/bin/bash\necho "ssh $*" >> "${log}"\ncase "$*" in *docker*) echo DONE; exit ${runExit};; esac\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'rsync'), `#!/bin/bash\necho "rsync $*" >> "${log}"\n`, { mode: 0o755 });
  const r = spawnSync('bash', [REMOTE, dir], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SILINX_ISE_HOST: 'h' } });
  const calls = fs.readFileSync(log, 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout, calls };
}

test('ise-remote.sh: a finished run fetches the logs and removes the remote folder', () => {
  const r = runRemote(0);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /^1 designs, \d+ s\n$/);
  assert.match(r.calls, /rm -rf silinx-device-/);
});

test('ise-remote.sh: a design that fails in the container is not a lost connection', () => {
  const r = runRemote(1);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  assert.match(r.calls, /rm -rf silinx-device-/);
});

test('ise-remote.sh: a lost connection fails, says so and keeps the remote folder (#2019)', () => {
  const r = runRemote(255);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^ise-remote: the connection was lost during the run; the remote folder silinx-device-\d+ is kept, its results are not complete\n$/);
  assert.doesNotMatch(r.calls, /rm -rf/);
  assert.match(r.calls, /rsync .*--include=\*\.log/);
});
