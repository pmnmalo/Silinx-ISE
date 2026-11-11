// ISE's settings script never comes from a build folder (#3407): a project's file named settings64.sh / settings32.sh
// is not copied into the build folder (it stays on the ssh host after a run); ssh.settings and vivado.settings set
// through the API are outside every build folder used before (ssh.earlierDirs, remembered when ssh.remoteDir changes,
// the API forgetting none); the device report's script checks ISE_SETTINGS as run.sh does; ssh.port is a port number
// and ssh.host no option of ssh.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scratchEnv } from './server-helpers.js';

let tmp;
const tc = await import('../server/toolchain.js');
const ise = await import('../server/ise.js');
const { deviceReportScript } = await import('../server/open-flow.js');
const api = p => tc.saveConfig(p, { fromApi: true });
const refused = async (p, message, status = 400) => {
  await assert.rejects(api(p), e => { assert.equal(e.message, message); assert.equal(e.status, status); return true; });
};
const POSIX_ONLY = process.platform === 'win32' && 'bash scripts';

before(async () => { tmp = await scratchEnv('silinx-build-settings-'); });
after(async () => { delete process.env.SILINX_WORKSPACE; await fs.rm(tmp, { recursive: true, force: true }); });

test('#3407 a project\'s file named as a settings script is not copied into the build folder', async () => {
  const dir = path.join(tmp, 'p');
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src', 'top.vhd'), 'entity top is port(a: in bit; y: out bit); end;\narchitecture r of top is begin y <= a; end;\n');
  const device = { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' };
  for (const name of ['settings64.sh', 'settings32.sh', 'Settings64.SH']) {
    await fs.writeFile(path.join(dir, 'src', name), 'echo hi\n');
    const pj = { name: 'p', top: 'top', device, files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }, { path: `src/${name}`, lang: 'vhdl', role: 'design' }] };
    await assert.rejects(ise.generateBuild(pj, dir, {}), e => {
      assert.equal(e.message, `src/${name}: a file named ${name} is not copied into the build folder (the name of ISE's settings script)`);
      assert.equal(e.status, 400);
      return true;
    });
    await assert.rejects(fs.access(path.join(dir, 'build', 'src', 'src', name)), name);
  }
  // the other back ends' sources (sourcesOnly) and a constraints file so named: the same
  const pj = { name: 'p', top: 'top', device: { family: 'artix7', part: 'xc7a35t', package: 'cpg236', speed: '-1' }, files: [{ path: 'src/settings64.sh', lang: 'vhdl', role: 'design' }] };
  await assert.rejects(ise.generateBuild(pj, dir, { sourcesOnly: true }), /^Error: src\/settings64\.sh: a file named settings64\.sh is not copied into the build folder/);
  // the project's own sources: built as before
  const ok = await ise.generateBuild({ name: 'p', top: 'top', device, files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }] }, dir, {});
  assert.deepEqual(ok.sources.map(s => s.buildPath), ['src/src/top.vhd']);
});

test('#3407 ssh.settings and vivado.settings: never in a build folder used before', async () => {
  await tc.saveConfig({ mode: 'ssh', ssh: { host: 'buildbox', user: 'u', remoteDir: 'silinx-build', settings: tc.DEFAULT_SETTINGS, earlierDirs: [] } });
  await api({ ssh: { remoteDir: 'old' } });
  assert.deepEqual((await tc.loadConfig()).ssh.earlierDirs, ['silinx-build']);
  // the build folder moved and the script in the one before, at once or after
  await refused({ ssh: { remoteDir: 'new', settings: '/home/u/old/proj/src/settings64.sh' } }, 'ssh.settings must be a path outside the earlier build folder old (its files came from projects)');
  await api({ ssh: { remoteDir: 'new' } });
  assert.deepEqual((await tc.loadConfig()).ssh.earlierDirs, ['silinx-build', 'old']);
  await refused({ ssh: { settings: '/home/u/old/proj/src/settings64.sh' } }, 'ssh.settings must be a path outside the earlier build folder old (its files came from projects)');
  await refused({ ssh: { settings: '/home/U/Silinx-Build/proj/settings64.sh' } }, 'ssh.settings must be a path outside the earlier build folder silinx-build (its files came from projects)');
  await refused({ ssh: { settings: '/home/u/new/proj/settings64.sh' } }, 'ssh.settings must be an absolute path outside ssh.remoteDir (the build folder)');
  await refused({ vivado: { mode: 'ssh', settings: '/home/u/old/p/settings64.sh' } }, 'vivado.settings must be a path outside the earlier build folder old (its files came from projects)');
  // the default build folder counts though never left; ISE's own script and a folder whose name only contains one: kept
  assert.equal((await api({ ssh: { settings: '/opt/Xilinx/14.7/ISE_DS/settings64.sh' } })).ssh.settings, '/opt/Xilinx/14.7/ISE_DS/settings64.sh');
  assert.equal((await api({ ssh: { settings: '/opt/older/settings64.sh' } })).ssh.settings, '/opt/older/settings64.sh');
  // back to an earlier folder: the one left is remembered, the one come back to is the build folder again
  await api({ ssh: { remoteDir: 'old', settings: tc.DEFAULT_SETTINGS } });
  assert.deepEqual((await tc.loadConfig()).ssh.earlierDirs, ['silinx-build', 'old', 'new']);
  await refused({ ssh: { settings: '/home/u/old/x/settings64.sh' } }, 'ssh.settings must be an absolute path outside ssh.remoteDir (the build folder)');
  await refused({ ssh: { settings: '/home/u/new/x/settings64.sh' } }, 'ssh.settings must be a path outside the earlier build folder new (its files came from projects)');
  // the list: config.json's only; sent unchanged (as the dialog sends what it read), accepted
  await refused({ ssh: { earlierDirs: [] } }, `ssh.earlierDirs can only be set in ${tc.configPath()}`, 403);
  assert.equal((await api({ ssh: { earlierDirs: ['silinx-build', 'old', 'new'], user: 'v' } })).ssh.user, 'v');
  // the API forgets no folder: past 100, ssh.remoteDir is config.json's
  await tc.saveConfig({ ssh: { remoteDir: 'b0' } });
  await tc.saveConfig({ ssh: { earlierDirs: Array.from({ length: 100 }, (_, i) => `a${i}`) } });
  await refused({ ssh: { remoteDir: 'b1' } }, `ssh.remoteDir: 100 build folders used already; another can only be set in ${tc.configPath()}`, 403);
  assert.equal((await tc.loadConfig()).ssh.remoteDir, 'b0');
  await tc.saveConfig({ mode: 'local', vivado: { mode: 'docker', settings: '' }, ssh: { host: '', user: '', remoteDir: 'silinx-build', settings: tc.DEFAULT_SETTINGS, earlierDirs: [] } });
});

test('#3407 ssh.port: a port number; ssh.host: no option of ssh', async () => {
  for (const port of ['22 -oProxyCommand=x', 0, 65536, -1, 2.5, 'abc', '', null])
    await refused({ ssh: { port } }, 'ssh.port must be a whole number from 1 to 65535');
  assert.equal((await api({ ssh: { port: '2222' } })).ssh.port, 2222);
  assert.equal((await api({ ssh: { port: 22 } })).ssh.port, 22);
  for (const host of ['-F', '-oProxyCommand'])
    await refused({ ssh: { host } }, 'ssh.host cannot start with - (an option of ssh)');
  assert.equal((await api({ ssh: { host: 'build-box.local' } })).ssh.host, 'build-box.local');
  await tc.saveConfig({ ssh: { host: '' } });
});

test('#3407 the device report\'s script sources ISE_SETTINGS only from outside its folder', { skip: POSIX_ONLY }, async () => {
  const root = path.join(tmp, 'report'), work = path.join(root, 'work'), outside = path.join(root, 'ise'), bin = path.join(root, 'bin');
  for (const d of [path.join(work, 'src'), outside, bin]) await fs.mkdir(d, { recursive: true });
  await fs.writeFile(path.join(bin, 'xdl'), '#!/bin/sh\necho "stub xdl" > device.xdlrc\n', { mode: 0o755 });
  const script = `export PATH="${bin}:$PATH"\n`;
  await fs.writeFile(path.join(outside, 'settings64.sh'), script);
  await fs.writeFile(path.join(work, 'src', 'settings64.sh'), script);
  await fs.writeFile(path.join(work, 'run.sh'), deviceReportScript(), { mode: 0o755 });
  const run = s => spawnSync('bash', ['run.sh', 'xc3s100ecp132-4'], { cwd: work, env: { PATH: '/usr/bin:/bin', ISE_SETTINGS: s } });
  for (const s of [path.join(work, 'src', 'settings64.sh'), 'src/settings64.sh']) {
    const r = run(s);
    assert.equal(r.status, 126, s);
    assert.equal(r.stderr.toString(), `ERROR: ISE_SETTINGS (${s}) is a file of the build folder: not sourced.\n`);
    assert.equal(r.stdout.toString(), '');
  }
  const r = run(path.join(outside, 'settings64.sh'));
  assert.equal(r.status, 0, r.stderr.toString());
  assert.equal(r.stderr.toString(), '');
  assert.match(r.stdout.toString(), /=== SILINX STEP xdlreport ===\n[\s\S]*=== SILINX DONE ===/);
});
