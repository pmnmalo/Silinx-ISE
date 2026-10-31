// The ISE runner's protections (#482, scripts/ise-runner/): the job-started hook that refuses every job but
// ise.yml's and quality.yml's of main, the on-line window, and that only those two workflows use the
// runner's "ise" label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { workflowFiles } from './workflows-lib.mjs';
import { REPO, WORKFLOWS, OPEN, HARD_CLOSE, lastOpening, needs, decide, runs, run, serviceCommands } from '../scripts/ise-runner/window.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'scripts/ise-runner');
const WF = path.join(ROOT, '.github/workflows');
const HOUR = 3600e3;
const posix = process.platform !== 'win32';

/** The jobs of a workflow: { name: [its lines] } (as test/workflows.test.js reads them). */
function jobs(yml) {
  const out = {};
  let name = null;
  for (const line of yml.slice(yml.indexOf('\njobs:\n') + 7).split('\n')) {
    const m = line.match(/^  ([\w-]+):$/);
    if (m) out[name = m[1]] = [];
    else if (name && /^ {4}/.test(line)) out[name].push(line);
  }
  return out;
}

// ---------------------------------------------------------------- the hook

function hook(env) {
  const r = spawnSync('sh', [path.join(DIR, 'job-started.sh')], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const OK = { GITHUB_REPOSITORY: REPO, GITHUB_EVENT_NAME: 'schedule', GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ise.yml@refs/heads/main` };

test('hook: the ISE and Quality workflows of main, on schedule or by hand, run', { skip: !posix }, () => {
  for (const wf of WORKFLOWS) for (const ev of ['schedule', 'workflow_dispatch']) {
    const r = hook({ ...OK, GITHUB_EVENT_NAME: ev, GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/${wf}@refs/heads/main` });
    assert.equal(r.code, 0, `${wf} ${ev}: ${r.err}`);
    assert.equal(r.out, `Silinx ISE runner: ${REPO}/.github/workflows/${wf}@refs/heads/main (${ev}) allowed\n`);
    assert.equal(r.err, '');
  }
});

test('hook: every other job is refused before its first step, saying why', { skip: !posix }, () => {
  const cases = [
    // a fork's pull request bringing a workflow of its own, or changing ise.yml
    [{ GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/7/merge', GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/evil.yml@refs/pull/7/merge` }, "event 'pull_request'"],
    [{ GITHUB_EVENT_NAME: 'pull_request_target' }, "event 'pull_request_target'"],
    [{ GITHUB_EVENT_NAME: 'push' }, "event 'push'"],
    [{ GITHUB_EVENT_NAME: 'workflow_run' }, "event 'workflow_run'"],
    // another workflow of main, the two workflows of another branch, another repository
    [{ GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ci.yml@refs/heads/main` }, `workflow '${REPO}/.github/workflows/ci.yml@refs/heads/main'`],
    [{ GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ise.yml@refs/heads/other` }, `workflow '${REPO}/.github/workflows/ise.yml@refs/heads/other'`],
    [{ GITHUB_REF: 'refs/heads/other' }, "ref 'refs/heads/other'"],
    [{ GITHUB_WORKFLOW_REF: `someone/Silinx-ISE/.github/workflows/ise.yml@refs/heads/main` }, "workflow 'someone/Silinx-ISE/.github/workflows/ise.yml@refs/heads/main'"],
    [{ GITHUB_REPOSITORY: 'someone/Silinx-ISE' }, "repository 'someone/Silinx-ISE'"],
    [{ GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ise.yml@refs/heads/main.evil` }, `workflow '${REPO}/.github/workflows/ise.yml@refs/heads/main.evil'`],
    // nothing set (an old runner): refused, not allowed
    [{ GITHUB_REPOSITORY: '', GITHUB_EVENT_NAME: '', GITHUB_REF: '', GITHUB_WORKFLOW_REF: '' }, "repository ''"],
  ];
  for (const [env, why] of cases) {
    const r = hook({ ...OK, ...env });
    assert.equal(r.code, 1, JSON.stringify(env));
    assert.equal(r.out, '');
    assert.equal(r.err, `Silinx ISE runner: refused, ${why} (only ${REPO}'s ise.yml and quality.yml of main, on schedule or by hand, run here)\n`);
  }
});

test('scripts: the shell scripts parse; install.sh sets the hook and the agent', { skip: !posix }, () => {
  for (const f of ['job-started.sh', 'window.sh', 'install.sh']) {
    const r = spawnSync('sh', ['-n', path.join(DIR, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
  const install = fs.readFileSync(path.join(DIR, 'install.sh'), 'utf8');
  assert.match(install, /echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=\$DEST\/job-started\.sh" >> "\$ENVF"/);
  assert.match(install, /cp "\$SRC\/job-started\.sh" "\$SRC\/window\.sh" "\$SRC\/window\.mjs" "\$DEST\/"/, 'copied out of the checkout');
  assert.match(install, /<key>StartInterval<\/key><integer>900<\/integer>/);
  assert.match(install, /<key>RunAtLoad<\/key><true\/>/);
});

/**
 * install.sh in a scratch folder: a configured runner (bin/runsvc.sh, .runner, externals/node*), the
 * Library and the home in the scratch folder, launchctl and chown recorded instead of run.
 */
function installIn(args, { env = {}, runner = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ise-runner-'));
  const dir = path.join(tmp, 'runner'), lib = path.join(tmp, 'Library'), home = path.join(tmp, 'home'), bin = path.join(tmp, 'bin');
  for (const d of [path.join(dir, 'bin'), path.join(dir, 'externals/node20/bin'), path.join(dir, 'externals/node24/bin'), lib, home, bin]) fs.mkdirSync(d, { recursive: true });
  if (runner) {
    fs.writeFileSync(path.join(dir, '.runner'), '{}');
    fs.writeFileSync(path.join(dir, 'bin/runsvc.sh'), '#!/bin/bash\n');
    fs.writeFileSync(path.join(dir, 'externals/node20/bin/node'), 'node 20');
    fs.writeFileSync(path.join(dir, 'externals/node24/bin/node'), 'node 24');
    fs.writeFileSync(path.join(dir, '.env'), 'LANG=en_US.UTF-8\nTMPDIR=/old\n');
    // a previous install's folder, whose path had a space (#891)
    fs.mkdirSync(path.join(lib, 'Application Support/Silinx-ISE-runner'), { recursive: true });
  }
  const log = path.join(tmp, 'calls');
  for (const t of ['launchctl', 'chown']) fs.writeFileSync(path.join(bin, t), `#!/bin/sh\necho "${t} $*" >> "${log}"\n`, { mode: 0o755 });
  // the runner's svc.sh (the mode without --system starts and stops the service through it)
  if (runner) fs.writeFileSync(path.join(dir, 'svc.sh'), `#!/bin/sh\necho "svc.sh $*" >> "${log}"\n`, { mode: 0o755 });
  const r = spawnSync('sh', [path.join(DIR, 'install.sh'), ...args.map(a => a.replace('RUNNER', dir))], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: home, SILINX_RUNNER_LIBRARY: lib, SILINX_RUNNER_LAUNCHCTL: path.join(bin, 'launchctl'),
      SILINX_RUNNER_CHOWN: path.join(bin, 'chown'), SILINX_RUNNER_HOME: '/var/empty/runner-home', ...env },
  });
  const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
  return { code: r.status, out: r.stdout, err: r.stderr, dir, lib, home, read, calls: () => (read(log) || '').split('\n').filter(Boolean) };
}

test('install.sh --system: the runner a daemon of its own user, the window root\'s, their scripts root\'s copies', { skip: !posix }, () => {
  const r = installIn(['--system', 'iserunner', 'RUNNER']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err, '');
  const dest = path.join(r.lib, 'Silinx-ISE-runner');
  // root's copies of the scripts and of the newest Node.js, owned by root
  assert.deepEqual(fs.readdirSync(dest).sort(), ['job-started.sh', 'node', 'window.mjs', 'window.sh']);
  assert.equal(fs.readFileSync(path.join(dest, 'node'), 'utf8'), 'node 24');
  assert.equal(fs.readFileSync(path.join(dest, 'window.mjs'), 'utf8'), fs.readFileSync(path.join(DIR, 'window.mjs'), 'utf8'));
  for (const f of ['job-started.sh', 'window.sh', 'node']) assert.equal(fs.statSync(path.join(dest, f)).mode & 0o777, 0o755, f);
  // the runner's .env: the hook, its temporary files in its folder (shared with Docker), Docker's socket; the rest kept
  assert.equal(r.read(path.join(r.dir, '.env')), `LANG=en_US.UTF-8\nACTIONS_RUNNER_HOOK_JOB_STARTED=${dest}/job-started.sh\nTMPDIR=${r.dir}/_tmp\nDOCKER_HOST=unix:///var/run/docker.sock\n`);
  assert.ok(fs.statSync(path.join(r.dir, '_tmp')).isDirectory());
  // the runner runs its hook unquoted: no whitespace in its path (#891)
  assert.match(r.read(path.join(r.dir, '.env')), /^ACTIONS_RUNNER_HOOK_JOB_STARTED=\S+$/m);
  assert.equal(fs.existsSync(path.join(r.lib, 'Application Support/Silinx-ISE-runner')), false, 'the old folder removed');
  assert.equal(r.read(path.join(r.dir, 'runsvc.sh')), '#!/bin/bash\n', 'runsvc.sh from bin/, as svc.sh install makes it');
  // the PATH runsvc.sh exports to the runner: Docker's CLI in /usr/local/bin (#904), not sudo's secure_path
  assert.equal(r.read(path.join(r.dir, '.path')), '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin\n');
  // the runner's daemon: its own user, not loaded by the installer (the window starts it)
  const runner = r.read(path.join(r.lib, 'LaunchDaemons/com.github.pmnmalo.silinx-ise.runner.plist'));
  assert.match(runner, /<key>UserName<\/key><string>iserunner<\/string>/);
  assert.match(runner, new RegExp(`<array><string>/bin/bash</string><string>${r.dir}/runsvc\\.sh</string></array>`));
  assert.match(runner, /<key>HOME<\/key><string>\/var\/empty\/runner-home<\/string>/);
  assert.match(runner, /<key>KeepAlive<\/key><dict><key>SuccessfulExit<\/key><false\/><\/dict>/);
  // the window: root's daemon (no UserName), root's copies, the runner's daemon to start and stop
  const win = r.read(path.join(r.lib, 'LaunchDaemons/com.github.pmnmalo.silinx-ise.runner-window.plist'));
  assert.doesNotMatch(win, /UserName/);
  assert.match(win, new RegExp(`<string>${dest}/window\\.sh</string><string>tick</string>`));
  assert.match(win, new RegExp(`<key>RUNNER_DAEMON</key><string>${r.lib}/LaunchDaemons/com\\.github\\.pmnmalo\\.silinx-ise\\.runner\\.plist</string>`));
  assert.match(win, new RegExp(`<key>STATE_DIR</key><string>${dest}</string>`));
  assert.match(win, /<key>StartInterval<\/key><integer>900<\/integer>/);
  assert.deepEqual(r.calls(), [
    'launchctl bootout system/com.github.pmnmalo.silinx-ise.runner-window',
    'launchctl bootout system/com.github.pmnmalo.silinx-ise.runner',
    `chown -R root:wheel ${dest}`,
    `chown iserunner ${r.dir}/_tmp ${r.dir}/_diag ${r.dir}/runsvc.sh ${r.dir}/.path ${r.dir}/.env`,
    `chown root:wheel ${r.lib}/LaunchDaemons/com.github.pmnmalo.silinx-ise.runner.plist ${r.lib}/LaunchDaemons/com.github.pmnmalo.silinx-ise.runner-window.plist`,
    `launchctl bootstrap system ${r.lib}/LaunchDaemons/com.github.pmnmalo.silinx-ise.runner-window.plist`,
  ]);
  // installed again: one entry each in .env; uninstalled: the daemons and the copies gone, .env without them
  assert.equal(installIn(['--system', 'iserunner', 'RUNNER']).code, 0);
  const again = spawnSync('sh', [path.join(DIR, 'install.sh'), '--system', 'iserunner', r.dir], { encoding: 'utf8', env: { PATH: process.env.PATH, SILINX_RUNNER_LIBRARY: r.lib, SILINX_RUNNER_LAUNCHCTL: 'true', SILINX_RUNNER_CHOWN: 'true', SILINX_RUNNER_HOME: '/var/empty/runner-home' } });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(r.read(path.join(r.dir, '.env')).match(/^ACTIONS_RUNNER_HOOK_JOB_STARTED=/gm).length, 1);
  const un = spawnSync('sh', [path.join(DIR, 'install.sh'), '--uninstall', '--system', 'iserunner', r.dir], { encoding: 'utf8', env: { PATH: process.env.PATH, SILINX_RUNNER_LIBRARY: r.lib, SILINX_RUNNER_LAUNCHCTL: 'true', SILINX_RUNNER_CHOWN: 'true', SILINX_RUNNER_HOME: '/var/empty/runner-home' } });
  assert.equal(un.status, 0, un.stderr);
  assert.deepEqual(fs.readdirSync(path.join(r.lib, 'LaunchDaemons')), []);
  assert.equal(fs.existsSync(dest), false);
  assert.equal(r.read(path.join(r.dir, '.env')), 'LANG=en_US.UTF-8\n');
});

test('install.sh --system: refused without sudo, or on a folder that is not a runner', { skip: !posix }, () => {
  const r = spawnSync('sh', [path.join(DIR, 'install.sh'), '--system', 'iserunner', os.tmpdir()], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  if (process.getuid?.() !== 0) {
    assert.equal(r.status, 1);
    assert.equal(r.stderr, '--system: run it with sudo\n');
  }
  const n = installIn(['--system', 'iserunner', 'RUNNER'], { runner: false });
  assert.equal(n.code, 1);
  assert.equal(n.err, `${n.dir}: not a configured runner (no bin/runsvc.sh / .runner)\n`);
  assert.deepEqual(n.calls(), []);
});

test('install.sh without --system: the hook and the window as the logged-in user, with a warning that says to use --system (#1442)', { skip: !posix }, () => {
  const r = installIn(['RUNNER']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /^WARNING: without --system the hook and the runner's \.env belong to \S+, the user the jobs run as; use 'sudo sh \S+install\.sh --system <user> <the runner's folder>' \(see the header\) on the machine that runs the nightly\.\n$/);
  const dest = path.join(r.home, 'Library/Silinx-ISE-runner');
  assert.deepEqual(fs.readdirSync(dest).sort(), ['job-started.sh', 'window.mjs', 'window.sh']);
  assert.equal(r.read(path.join(r.dir, '.env')), `LANG=en_US.UTF-8\nTMPDIR=/old\nACTIONS_RUNNER_HOOK_JOB_STARTED=${dest}/job-started.sh\n`);
  assert.match(r.read(path.join(r.home, 'Library/LaunchAgents/com.github.pmnmalo.silinx-ise.runner-window.plist')), new RegExp(`<key>RUNNER_DIR</key><string>${r.dir}</string>`));
  // the service restarted through svc.sh, the window's agent loaded
  assert.deepEqual(r.calls().filter(c => c.startsWith('svc.sh')), ['svc.sh stop', 'svc.sh start']);
  assert.match(r.calls().at(-1), /^launchctl bootstrap gui\/\d+ .*runner-window\.plist$/);
  // the header: --system first, the mode to use; the cache to clear after a suspicious run
  const install = fs.readFileSync(path.join(DIR, 'install.sh'), 'utf8');
  assert.ok(install.indexOf('install.sh --system <user>') < install.indexOf('install.sh <the runner\'s folder>'), '--system documented first');
  assert.match(install, /--system is the one to use/);
  assert.match(install, /clear the\n# runner user's silinx-cache folder/);
});

test('install.sh --docker-acl: the runner\'s user on Docker Desktop\'s socket, again each time it is made', { skip: !posix }, () => {
  const r = installIn(['--docker-acl', 'iserunner']);
  assert.equal(r.code, 0, r.err);
  const plist = r.read(path.join(r.home, 'Library/LaunchAgents/com.github.pmnmalo.silinx-ise.docker-acl.plist'));
  const sock = path.join(r.home, '.docker/run/docker.sock');
  assert.match(plist, new RegExp(`<string>i=0; until \\[ -S '${sock}' \\] \\|\\| \\[ \\$i -ge 60 \\]; do sleep 1; i=\\$\\(\\(i\\+1\\)\\); done; ls -le '${sock}' \\| grep -qF 'user:iserunner allow read,write' \\|\\| chmod \\+a 'user:iserunner allow read,write' '${sock}'</string>`));
  assert.match(plist, new RegExp(`<key>WatchPaths</key><array><string>${path.dirname(sock)}</string></array>`));
  assert.match(plist, /<key>StartInterval<\/key><integer>300<\/integer>/);
  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/);
  assert.equal(r.calls().length, 2);
  assert.match(r.calls()[0], /^launchctl bootout gui\/\d+\/com\.github\.pmnmalo\.silinx-ise\.docker-acl$/);
  assert.match(r.calls()[1], new RegExp(`^launchctl bootstrap gui/\\d+ ${r.home}/Library/LaunchAgents/com\\.github\\.pmnmalo\\.silinx-ise\\.docker-acl\\.plist$`));
});

test('install.sh --docker-acl: the agent waits for the socket Docker Desktop makes anew, then sets the ACL (#1799)', { skip: !posix }, async () => {
  const r = installIn(['--docker-acl', 'iserunner']);
  assert.equal(r.code, 0, r.err);
  const plist = r.read(path.join(r.home, 'Library/LaunchAgents/com.github.pmnmalo.silinx-ise.docker-acl.plist'));
  const cmd = /<string>-c<\/string><string>(.*?)<\/string>/.exec(plist)[1].replace(/&gt;/g, '>');
  const sock = path.join(r.home, '.docker/run/docker.sock');
  fs.mkdirSync(path.dirname(sock), { recursive: true });
  // chmod and ls stubbed: each chmod logged with whether the socket was there; no ACL yet
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'acl-bin-')), log = path.join(bin, 'log');
  fs.writeFileSync(path.join(bin, 'chmod'), `#!/bin/sh\n[ -S '${sock}' ] && s=socket || s=none\necho "$s chmod $*" >> '${log}'\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'ls'), `#!/bin/sh\necho 'srwxr-xr-x  1 admin  staff  0 Oct 27 23:01 ${sock}'\n`, { mode: 0o755 });
  const child = spawn('/bin/sh', ['-c', cmd], { env: { PATH: `${bin}:${process.env.PATH}` } });
  const exited = new Promise(res => child.on('exit', res));
  await new Promise(res => setTimeout(res, 1500));
  assert.equal(fs.existsSync(log), false, 'no chmod before the socket is there');
  const server = net.createServer().listen(sock);
  await new Promise(res => server.on('listening', res));
  assert.equal(await exited, 0);
  server.close();
  assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), [
    `socket chmod +a user:iserunner allow read,write ${sock}`,
  ]);
});

test('install.sh --docker-acl: the agent leaves an ACL that is there alone, never taking it away (#2268)', { skip: !posix }, async () => {
  const r = installIn(['--docker-acl', 'iserunner']);
  assert.equal(r.code, 0, r.err);
  const plist = r.read(path.join(r.home, 'Library/LaunchAgents/com.github.pmnmalo.silinx-ise.docker-acl.plist'));
  const cmd = /<string>-c<\/string><string>(.*?)<\/string>/.exec(plist)[1].replace(/&gt;/g, '>');
  const sock = path.join(r.home, '.docker/run/docker.sock');
  fs.mkdirSync(path.dirname(sock), { recursive: true });
  // chmod and ls stubbed: the socket has the runner user's ACL already
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'acl-bin-')), log = path.join(bin, 'log');
  fs.writeFileSync(path.join(bin, 'chmod'), `#!/bin/sh\necho "chmod $*" >> '${log}'\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'ls'), `#!/bin/sh\necho 'srwxr-xr-x+ 1 admin  staff  0 Oct 27 23:01 ${sock}'\necho ' 0: user:iserunner allow read,write'\n`, { mode: 0o755 });
  const server = net.createServer().listen(sock);
  await new Promise(res => server.on('listening', res));
  // launchd ran it every 10 seconds or so (#2268): each run leaves the ACL as it is
  for (let i = 0; i < 3; i++) {
    const p = spawnSync('/bin/sh', ['-c', cmd], { env: { PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(p.status, 0, String(p.stderr));
  }
  server.close();
  assert.equal(fs.existsSync(log), false, 'no chmod while the ACL is there');
});

test('window: the runner\'s service started and stopped through svc.sh, or as root\'s daemon', () => {
  assert.deepEqual(serviceCommands('start', { RUNNER_DIR: '/r' }), [{ cmd: './svc.sh', args: ['start'], cwd: '/r', optional: false }]);
  assert.deepEqual(serviceCommands('stop', { RUNNER_DIR: '/r' }), [{ cmd: './svc.sh', args: ['stop'], cwd: '/r', optional: false }]);
  const env = { RUNNER_DIR: '/r', RUNNER_DAEMON: '/Library/LaunchDaemons/com.github.pmnmalo.silinx-ise.runner.plist' };
  assert.deepEqual(serviceCommands('start', env), [
    { cmd: 'launchctl', args: ['bootout', 'system/com.github.pmnmalo.silinx-ise.runner'], cwd: '/', optional: true },
    // launchd refused the bootstrap of a daemon still exiting (5: Input/output error, 22 October): waited for
    { cmd: '/bin/sh', args: ['-c', 'i=0; while launchctl print system/com.github.pmnmalo.silinx-ise.runner >/dev/null 2>&1 && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done'], cwd: '/', optional: true },
    { cmd: 'launchctl', args: ['bootstrap', 'system', env.RUNNER_DAEMON], cwd: '/', optional: false },
  ]);
  assert.deepEqual(serviceCommands('stop', env), [{ cmd: 'launchctl', args: ['bootout', 'system/com.github.pmnmalo.silinx-ise.runner'], cwd: '/', optional: false }]);
  assert.throws(() => serviceCommands('restart', env), /service: start or stop, not 'restart'/);
});

test('window.sh: root\'s own Node.js copy first, then the runner\'s', { skip: !posix }, () => {
  const text = fs.readFileSync(path.join(DIR, 'window.sh'), 'utf8');
  assert.match(text, /^node="\$\(dirname "\$0"\)\/node"\n\[ -x "\$node" \] \|\| node=\$\(ls -d "\$RUNNER_DIR"\/externals\/node\*\/bin\/node/m);
});

// ---------------------------------------------------------------- the label

test('workflows: only ise.yml and quality.yml reach the ISE runner, as the hook and the window say', () => {
  const hosted = /^(ubuntu|macos|windows)-[\w.]+$/;
  const reach = [];
  for (const f of workflowFiles(WF)) {
    const yml = fs.readFileSync(path.join(WF, f), 'utf8');
    for (const [name, lines] of Object.entries(jobs(yml))) {
      const at = lines.findIndex(l => /^ {4}runs-on:/.test(l));
      if (at < 0) continue;          // a reusable workflow's call
      const v = lines[at].replace(/^ {4}runs-on:\s*/, '').replace(/\s+#.*/, '');
      assert.notEqual(v, '', `${f}:${name}: runs-on as a group / labels map`);
      if (v === '[self-hosted, ise]') { reach.push(`${f}:${name}`); continue; }
      if (v === '${{ matrix.os }}') {
        // the matrix's operating systems: GitHub's runners only
        const body = lines.join('\n');
        const os = /^ {8}os: (.+)$/m.exec(body)[1];
        for (const label of os.match(/[\w.-]+-latest|[\w.-]+-\d[\w.]*/g)) assert.match(label, hosted, `${f}:${name}`);
        assert.doesNotMatch(os, /self-hosted|\bise\b/, `${f}:${name}`);
        continue;
      }
      assert.match(v, hosted, `${f}:${name}: runs-on ${v}`);
    }
  }
  assert.deepEqual(reach, ['ise.yml:ise', 'quality.yml:compare']);
  assert.deepEqual(WORKFLOWS, [...new Set(reach.map(j => j.split(':')[0]))]);
  const hookText = fs.readFileSync(path.join(DIR, 'job-started.sh'), 'utf8');
  for (const f of WORKFLOWS) assert.ok(hookText.includes(`"$REPO/.github/workflows/${f}@refs/heads/main"`), f);
  assert.match(hookText, /^REPO=pmnmalo\/Silinx-ISE$/m);
  // the window opens before ise.yml's cron in every season (Lisbon: UTC+0 or +1)
  assert.match(fs.readFileSync(path.join(WF, 'ise.yml'), 'utf8'), /cron: '47 21 \* \* \*'/);
  assert.ok(OPEN.hour * 60 + OPEN.minute < 21 * 60 + 47);
  assert.match(fs.readFileSync(path.join(WF, 'quality.yml'), 'utf8'), /cron: '0 23 \* \* 6'/);
});

// ---------------------------------------------------------------- the window

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m);   // October 2026: the 17th a Saturday, the 20th a Tuesday
const state = (opened, n = needs(opened)) => ({ opened: opened.getTime(), needs: n });

test('window: the latest opening, and what a window waits for', () => {
  assert.equal(at(17, 0).getDay(), 6);
  assert.deepEqual(lastOpening(at(20, 21, 15)), at(20, 21, 15));
  assert.deepEqual(lastOpening(at(20, 23, 59)), at(20, 21, 15));
  assert.deepEqual(lastOpening(at(21, 3)), at(20, 21, 15));
  assert.deepEqual(lastOpening(at(20, 21, 14)), at(19, 21, 15));
  assert.deepEqual(lastOpening(at(1, 8)), new Date(2026, 8, 30, 21, 15), 'across a month');
  assert.deepEqual(needs(at(20, 21, 15)), ['ise.yml']);
  assert.deepEqual(needs(at(17, 21, 15)), ['ise.yml', 'quality.yml'], 'Saturdays: Quality too');
  assert.deepEqual(needs(at(18, 21, 15)), ['ise.yml']);
});

test('window: it opens every evening, and closes once its runs are done', () => {
  const o = at(20, 21, 15);
  const idle = { running: true, busy: false, active: 0 };
  // the first tick ever, and the evening's
  assert.deepEqual(decide({ now: at(20, 21, 20), state: null, running: false }), { action: 'start', state: state(o), why: `the window of ${o.toString()} opens` });
  assert.equal(decide({ now: at(20, 21, 20), state: state(at(19, 21, 15)), running: false }).action, 'start');
  assert.equal(decide({ now: at(20, 21, 20), state: state(at(19, 21, 15)), running: true }).action, 'none', 'already on line');
  // the machine off all evening: the window still opens when it starts
  assert.equal(decide({ now: at(21, 9), state: state(at(19, 21, 15)), running: false }).action, 'start');
  // open: waiting for the runs, a run queued, a job on it
  assert.deepEqual(decide({ now: at(20, 22), state: state(o), ...idle, ran: {} }), { action: 'none', state: state(o), why: 'waiting for the runs' });
  assert.deepEqual(decide({ now: at(21, 1), state: state(o), ...idle, active: 1, ran: { 'ise.yml': true } }).why, '1 run(s) queued or running');
  assert.deepEqual(decide({ now: at(21, 1), state: state(o), running: true, busy: true }).why, 'a job is running');
  // done: idle, nothing queued, ISE has run
  assert.deepEqual(decide({ now: at(21, 1), state: state(o), ...idle, ran: { 'ise.yml': true } }), { action: 'stop', state: state(o), why: 'the window\'s runs have finished' });
  // closed: it stays off until the next evening
  assert.deepEqual(decide({ now: at(21, 2), state: state(o), running: false }), { action: 'none', state: state(o), why: 'closed' });
  assert.equal(decide({ now: at(21, 21, 15), state: state(o), running: false }).action, 'start');
});

test('window: on Saturdays it waits for the Quality comparison too', () => {
  const o = at(17, 21, 15);
  const idle = { running: true, busy: false, active: 0 };
  assert.equal(decide({ now: at(17, 23), state: state(o), ...idle, ran: { 'ise.yml': true } }).action, 'none');
  assert.equal(decide({ now: at(18, 10), state: state(o), ...idle, ran: { 'ise.yml': true, 'quality.yml': true } }).action, 'stop');
});

test('window: closed after its hours whatever GitHub says, never under a running job', () => {
  const o = at(20, 21, 15);
  const late = new Date(o.getTime() + HARD_CLOSE * HOUR);
  assert.equal(decide({ now: new Date(late - 60e3), state: state(o), running: true, busy: false, active: null, ran: null }).why, 'GitHub not reached');
  assert.deepEqual(decide({ now: late, state: state(o), running: true, busy: false, active: null, ran: null }).why, `${HARD_CLOSE} hours since the opening`);
  assert.equal(decide({ now: late, state: state(o), running: true, busy: false, active: 3, ran: {} }).action, 'stop', 'a queued run waits for the next evening');
  assert.equal(decide({ now: late, state: state(o), running: true, busy: true }).action, 'none');
  // the runner's service started at log-in after the window closed: stopped again at once
  assert.equal(decide({ now: at(21, 16), state: state(o), running: true, busy: false, active: 0, ran: { 'ise.yml': true } }).action, 'stop');
});

test('window: opened by hand, it closes after a run of either workflow', () => {
  const s = { opened: at(20, 10).getTime(), needs: 'any' };
  const idle = { now: at(20, 12), state: s, running: true, busy: false, active: 0 };
  assert.equal(decide({ ...idle, ran: {} }).action, 'none');
  assert.equal(decide({ ...idle, ran: { 'quality.yml': true } }).action, 'stop');
  assert.equal(decide({ ...idle, ran: { 'ise.yml': true } }).action, 'stop');
  // the evening's window replaces it
  assert.equal(decide({ ...idle, now: at(20, 21, 20), running: false }).action, 'start');
});

test('window: the runs read from GitHub\'s API (both workflows only, the window\'s own)', async () => {
  const asked = [];
  const fetchJson = async url => {
    asked.push(url);
    if (url.includes('/actions/runs?status=queued')) return { workflow_runs: [{ path: '.github/workflows/ise.yml' }, { path: '.github/workflows/ci.yml' }] };
    if (url.includes('/actions/runs?status=')) return { workflow_runs: [] };
    if (url.includes('/workflows/ise.yml/')) return { total_count: 2 };
    return { total_count: 0 };
  };
  assert.deepEqual(await runs(Date.UTC(2026, 9, 20, 20, 15, 0, 123), fetchJson), { active: 1, ran: { 'ise.yml': true, 'quality.yml': false } });
  assert.equal(asked.length, 7, 'a tick makes 7 requests: 28 an hour, under the 60 without a token');
  assert.ok(asked.every(u => u.startsWith(`https://api.github.com/repos/${REPO}/actions/`)));
  assert.ok(asked.includes(`https://api.github.com/repos/${REPO}/actions/workflows/quality.yml/runs?status=completed&created=%3E%3D2026-10-20T20:15:00Z&per_page=1`));
  // a window opened by the schedule counts its scheduled runs only (#901)
  asked.length = 0;
  await runs(Date.UTC(2026, 9, 20, 20, 15), fetchJson, true);
  assert.ok(asked.includes(`https://api.github.com/repos/${REPO}/actions/workflows/ise.yml/runs?status=completed&created=%3E%3D2026-10-20T20:15:00Z&event=schedule&per_page=1`));
  assert.equal(asked.filter(u => u.includes('event=schedule')).length, 2);
});

test('window: a run by hand does not close the evening\'s window before its scheduled run (#901)', async () => {
  // the GitHub API as on 2026-10-21: a run of ise.yml by hand finished in the window, the scheduled one not yet
  const fetchJson = async url => {
    if (url.includes('/actions/runs?status=')) return { workflow_runs: [] };
    if (url.includes('/workflows/ise.yml/')) return { total_count: url.includes('event=schedule') ? 0 : 1 };
    return { total_count: 0 };
  };
  const tick = async st => {
    const m = { logs: [], svc: [], st, now: () => at(21, 1, 4), readState: () => m.st, writeState: x => { m.st = x; },
      running: () => true, busy: () => false, runs: (since, f, scheduled) => runs(since, fetchJson, scheduled),
      service: a => m.svc.push(a), log: msg => m.logs.push(msg) };
    return [await run('tick', m), m];
  };
  const [d] = await tick(state(at(20, 21, 15)));
  assert.deepEqual([d.action, d.why], ['none', 'waiting for the runs']);
  // opened by hand: the run by hand closes it, as before
  const [h, m] = await tick({ opened: at(20, 22).getTime(), needs: 'any' });
  assert.deepEqual([h.action, m.svc], ['stop', ['stop']]);
});

test('window: the commands, against a fake machine', async () => {
  const machine = over => {
    const m = { logs: [], svc: [], st: null, now: () => at(20, 21, 20), readState: () => m.st, writeState: s => { m.st = s; },
      running: () => false, busy: () => false, runs: async () => ({ active: 0, ran: { 'ise.yml': true } }),
      service: a => m.svc.push(a), log: msg => m.logs.push(msg), ...over };
    return m;
  };
  // tick: the evening's window opens
  let m = machine();
  assert.equal((await run('tick', m)).action, 'start');
  assert.deepEqual(m.svc, ['start']);
  assert.deepEqual(m.st, state(at(20, 21, 15)));
  // tick, on line, runs done: stops; quiet when there is nothing to do
  m = machine({ running: () => true, now: () => at(21, 2) });
  m.st = state(at(20, 21, 15));
  assert.equal((await run('tick', m)).action, 'stop');
  assert.deepEqual(m.svc, ['stop']);
  assert.deepEqual(m.logs, ['stop: the window\'s runs have finished']);
  m = machine({ now: () => at(21, 2) });
  m.st = state(at(20, 21, 15));
  await run('tick', m);
  assert.deepEqual([m.svc, m.logs], [[], []]);
  // GitHub not reached: logged, nothing changed
  m = machine({ running: () => true, now: () => at(21, 2), runs: async () => { throw new Error('offline'); } });
  m.st = state(at(20, 21, 15));
  assert.equal((await run('tick', m)).action, 'none');
  assert.deepEqual(m.logs, ['GitHub: offline']);
  // open, close, status
  m = machine({ now: () => at(20, 10) });
  m.st = state(at(19, 21, 15));
  await run('open', m);
  assert.deepEqual([m.svc, m.st], [['start'], { opened: at(20, 10).getTime(), needs: 'any' }]);
  m = machine({ running: () => true, busy: () => true });
  await run('close', m);
  assert.deepEqual([m.svc, m.logs], [[], ['none: a job is running: not closed']]);
  m = machine({ running: () => true });
  await run('close', m);
  assert.deepEqual(m.svc, ['stop']);
  m = machine({ running: () => true, now: () => at(21, 2) });
  m.st = state(at(20, 21, 15));
  await run('status', m);
  assert.deepEqual(m.svc, [], 'status changes nothing');
  assert.equal(m.logs.length, 1);
  assert.match(m.logs[0], /^runner on line; window .+; next tick: stop \(the window's runs have finished\)$/);
  await assert.rejects(run('reboot', machine()), /usage: window\.sh tick \| open \| close \| status \(not 'reboot'\)/);
});
