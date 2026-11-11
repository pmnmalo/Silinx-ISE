// Command line (bin/silinx.js): every subcommand, help, exit codes and error messages.
// Each run is a real `node bin/silinx.js ...` with HOME, SILINX_WORKSPACE and SILINX_CONFIG_DIR in a
// scratch directory and a PATH of fake tools only, so nothing touches ~/Silinx-projects or ~/.silinx.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { scratchEnv, makeFakes, isolatedPath, startApp, sleep, ROOT, POSIX_ONLY } from './server-helpers.js';

const CLI = path.join(ROOT, 'bin', 'silinx.js');
// lets a killed `serve` exit normally (so its coverage is written)
const EXIT_ON_TERM = `--import=data:text/javascript,process.on('SIGTERM',()=>process.exit(0))`;

let tmp, fakes, home, env;
before(async () => {
  tmp = await scratchEnv('silinx-cli-test-');
  fakes = await makeFakes(tmp);
  home = path.join(tmp, 'home');
  await fs.mkdir(home, { recursive: true });
  env = {
    ...process.env,
    HOME: home, USERPROFILE: home,
    SILINX_WORKSPACE: process.env.SILINX_WORKSPACE, SILINX_CONFIG_DIR: process.env.SILINX_CONFIG_DIR,
    PATH: isolatedPath(fakes.open),
    FAKE_OPEN_LOG: path.join(tmp, 'open.log'),
  };
  delete env.XILINX;
  delete env.PORT;
});
after(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

/** Run the CLI to completion: { code, out, err }. */
function cli(args, { extraEnv = {}, cwd = tmp, nodeArgs = [] } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [...nodeArgs, CLI, ...args], { cwd, env: { ...env, ...extraEnv } });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => resolve({ code, out, err }));
  });
}

/** Start a long-running CLI (serve) and wait until stdout matches `re`. */
function cliUntil(args, re, { extraEnv = {} } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [EXIT_ON_TERM, CLI, ...args], { cwd: tmp, env: { ...env, ...extraEnv } });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`timeout waiting for ${re}\nstdout: ${out}\nstderr: ${err}`)); }, 10000);
    p.stdout.on('data', d => { out += d; if (re.test(out)) { clearTimeout(timer); resolve({ proc: p, out: () => out, err: () => err }); } });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => { clearTimeout(timer); reject(new Error(`exited (${code}) before ${re}\nstdout: ${out}\nstderr: ${err}`)); });
  });
}
const stop = p => new Promise(r => { if (p.exitCode !== null) return r(); p.removeAllListeners('close'); p.on('close', r); p.kill('SIGTERM'); });

// `serve` on a free port: the port found free is closed before Silinx opens it, so another program of
// the machine may take it meanwhile (CI, #217): then another one
async function serveOnFreePort(args, re, opts = {}) {
  for (let k = 0; ; k++) {
    const port = await freePort();
    try { return { port, ...await cliUntil(args(port), re, opts.env ? { ...opts, extraEnv: opts.env(port) } : opts) }; } catch (e) {
      if (k >= 2 || !/is used by another program/.test(e.message)) throw e;
    }
  }
}

async function freePort() {
  const s = net.createServer();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise(r => s.close(r));
  return port;
}

const TOP_V = 'module top(input clk, input [1:0] sw, output reg [1:0] led, output dbg);\n  always @(posedge clk) led <= sw;\n  assign dbg = 1\'b0;\nendmodule\n';
const TB_V = (want) => `module tb;\n  reg clk = 0; reg [1:0] sw = 2'b10; wire [1:0] led; wire dbg;\n  top dut(.clk(clk), .sw(sw), .led(led), .dbg(dbg));\n  always #5 clk = ~clk;\n  initial begin #20 $display("led=%b", led); if (led != 2'b${want}) $error("mismatch"); $finish; end\nendmodule\n`;

async function project(name, { tb = TB_V('10'), top = TOP_V, pj = {} } = {}) {
  const dir = path.join(tmp, 'projects', name);
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'sim'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src', 'top.v'), top);
  await fs.writeFile(path.join(dir, 'sim', 'tb.v'), tb);
  await fs.writeFile(path.join(dir, 'silinx.json'), JSON.stringify({
    name, device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, top: 'top', simTop: 'tb',
    files: [{ path: 'src/top.v', lang: 'verilog', role: 'design' }, { path: 'sim/tb.v', lang: 'verilog', role: 'sim' }], ...pj,
  }));
  return dir;
}

// ------------------------------------------------------------------------------------------------
// help / unknown commands
// ------------------------------------------------------------------------------------------------

test('help: `help`, --help, -h and `<command> --help` print the usage and run nothing', async () => {
  const runs = await Promise.all([['help'], ['--help'], ['-h'], ['serve', '--help'], ['check', '--help'], ['sim', '-h'], ['ucf', '--help'], ['toolchain', '--help']].map(a => cli(a)));
  for (const r of runs) {
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^usage:\n {2}silinx serve/);
    for (const c of ['check', 'sim', 'ucf', 'toolchain']) assert.match(r.out, new RegExp(`silinx ${c} `));
    assert.equal(r.err, '');
  }
  assert.ok(!fss.existsSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json')), 'toolchain --help changed nothing');
});

// #3133: the command's old name (#2624) is gone after its two releases: no file, no bin entry (the name built from
// two parts, as test/old-name.test.js counts it)
test('#3133 the old command is gone: package.json names bin/silinx.js only', () => {
  assert.ok(!fss.existsSync(path.join(ROOT, 'bin', ['silinx', 'ise'].join('-') + '.js')));
  for (const f of ['package.json', 'package-lock.json']) {
    const pkg = JSON.parse(fss.readFileSync(path.join(ROOT, f), 'utf8'));
    assert.deepEqual((f === 'package.json' ? pkg : pkg.packages['']).bin, { silinx: 'bin/silinx.js' }, f);
  }
});

test('unknown command: error message + usage on stderr, exit code 1', async () => {
  const r = await cli(['frobnicate']);
  assert.equal(r.code, 1);
  assert.match(r.err, /^silinx: unknown command 'frobnicate'\nusage:/);
  assert.equal(r.out, '');
});

// ------------------------------------------------------------------------------------------------
// check / sim
// ------------------------------------------------------------------------------------------------

test('check: OK design (exit 0), --top, errors (exit 1), missing project (exit 1)', async () => {
  const dir = await project('Chk');
  let r = await cli(['check', dir]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^OK: top elaborated \(\d+ signals, \d+ processes\)$/m);
  r = await cli(['check', '--top', 'top', dir]);
  assert.equal(r.code, 0, r.err);
  r = await cli(['check'], { cwd: dir });   // default: the current directory
  assert.equal(r.code, 0, r.err);
  r = await cli(['check', dir, '--top', 'nosuch']);
  assert.equal(r.code, 1);
  assert.match(r.out, /^ERROR: /m);

  const bad = await project('ChkBad', { top: 'module top(input a, output y);\n  assign y = ;\nendmodule\n' });
  r = await cli(['check', bad]);
  assert.equal(r.code, 1);
  assert.match(r.out, /^ERROR: src\/top\.v:2:\d+: /m);

  r = await cli(['check', path.join(tmp, 'nowhere')]);
  assert.equal(r.code, 1);
  assert.match(r.err, /^silinx: no Silinx project in .*nowhere \(silinx.json not found\)$/m);
  assert.doesNotMatch(r.err, /\n\s+at /, 'no stack trace');
  await fs.mkdir(path.join(tmp, 'broken'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'broken', 'silinx.json'), '{nope');
  r = await cli(['check', path.join(tmp, 'broken')]);
  assert.equal(r.code, 1);
  assert.match(r.err, /^silinx: cannot read .*silinx.json: /);
  r = await cli(['check', path.join(tmp, 'broken')], { extraEnv: { SILINX_DEBUG: '1' } });
  assert.match(r.err, /\n\s+at /, 'SILINX_DEBUG shows the stack');
});

test('sim: passing testbench (exit 0) with VCD, failing assertion (exit 2), --top / --time', async () => {
  const dir = await project('Sim');
  const vcd = path.join(tmp, 'sim.vcd');
  let r = await cli(['sim', dir, '--time', '100', '--vcd', vcd]);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /^\[20\.000 ns\] led=10$/m);
  assert.match(r.out, /^Simulation stopped at 20 ns \(finish\)$/m);
  assert.match(r.out, /VCD written to .*sim\.vcd/);
  assert.match(await fs.readFile(vcd, 'utf8'), /\$enddefinitions/);
  // the design top alone: runs until --time
  r = await cli(['sim', dir, '--top', 'top', '--time', '50']);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /^Simulation stopped at 50 ns$/m);

  const failing = await project('SimBad', { tb: TB_V('01') });
  r = await cli(['sim', failing]);
  assert.equal(r.code, 2);
  assert.match(r.out, /ERROR: mismatch/);
  // a compile error stops before simulating
  const broken = await project('SimBroken', { tb: 'module tb; initial begin $display("x") end endmodule\n' });
  r = await cli(['sim', broken]);
  assert.equal(r.code, 1);
  assert.match(r.out, /^ERROR: sim\/tb\.v:/m);
});

// ------------------------------------------------------------------------------------------------
// ucf
// ------------------------------------------------------------------------------------------------

test('ucf: pins from a board written to the constraints file and the project updated', async () => {
  const dir = await project('Ucf', { pj: { constraints: '' } });
  let r = await cli(['ucf', dir, '--board', 'basys2']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^constraints\/top\.ucf: clk, sw, led assigned for Digilent Basys2; NOT assigned: dbg$/m);
  const ucf = await fs.readFile(path.join(dir, 'constraints', 'top.ucf'), 'utf8');
  assert.match(ucf, /^# UCF for top 'top' on Digilent Basys2 \(xc3s250e-4-cp132\), generated by Silinx/);
  assert.match(ucf, /NET "led<1>" LOC = "M11"/);
  const pj = JSON.parse(await fs.readFile(path.join(dir, 'silinx.json'), 'utf8'));
  assert.equal(pj.board, 'basys2');
  assert.equal(pj.constraints, 'constraints/top.ucf');
  assert.deepEqual(pj.device, { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });
  assert.deepEqual((await fs.readdir(dir)).filter(f => f.endsWith('.tmp')), []);
  // --part picks the board variant; the saved board is used when --board is omitted
  r = await cli(['ucf', '--part', 'xc3s100e', dir]);
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'silinx.json'), 'utf8')).device.part, 'xc3s100e');
  // custom constraints path is kept
  const dir2 = await project('Ucf2', { pj: { constraints: 'pins/board.ucf', board: 'nexys2' } });
  r = await cli(['ucf', dir2]);
  assert.equal(r.code, 0, r.err);
  assert.ok(fss.existsSync(path.join(dir2, 'pins', 'board.ucf')));
});

test('ucf: unknown / missing board and a top that does not elaborate exit 1', async () => {
  const dir = await project('UcfBad');
  let r = await cli(['ucf', dir, '--board', 'zx81']);
  assert.equal(r.code, 1);
  assert.match(r.err, /^unknown board 'zx81'$/m);
  r = await cli(['ucf', dir]);
  assert.equal(r.code, 1);
  assert.match(r.err, /^no board: give --board <id>/m);
  const noTop = await project('UcfNoTop', { pj: { top: 'missing' } });
  r = await cli(['ucf', noTop, '--board', 'basys2']);
  assert.equal(r.code, 1);
  assert.match(r.err, /^cannot elaborate top 'missing'$/m);
});

// ------------------------------------------------------------------------------------------------
// toolchain
// ------------------------------------------------------------------------------------------------

test('toolchain: report, --docker configuration (available / not available)', { skip: POSIX_ONLY }, async () => {
  let r = await cli(['toolchain']);
  assert.equal(r.code, 0, r.err);
  // a new installation: the Silinx toolchain, no ISE needed (#27)
  assert.match(r.out, /^toolchain \(silinx\): available - Silinx toolchain \(no ISE\)/m);
  assert.match(r.out, /^programmers: none$/m);

  const withTools = { PATH: isolatedPath(fakes.prog, fakes.docker) };
  r = await cli(['toolchain'], { extraEnv: withTools });
  const progs = /^programmers: (.*)$/m.exec(r.out)[1].split(', ').sort();
  assert.deepEqual(progs, ['djtgcfg', 'impact', 'openFPGALoader', 'xc3sprog']);

  r = await cli(['toolchain', '--docker', 'silinx/ise:14.7', '--settings', '/opt/ise/settings64.sh'], { extraEnv: withTools });
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /^Silinx configured to run Xilinx ISE from docker image 'silinx\/ise:14.7'\.$/m);
  assert.match(r.out, /^ISE \(docker\): available - docker image silinx\/ise:14.7$/m);
  const cfg = JSON.parse(await fs.readFile(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), 'utf8'));
  assert.equal(cfg.mode, 'docker');
  assert.equal(cfg.docker.image, 'silinx/ise:14.7');
  assert.equal(cfg.docker.settings, '/opt/ise/settings64.sh');
  assert.ok(!fss.existsSync(path.join(home, '.silinx')), 'the real ~/.silinx is never used');

  // the image is not present locally: configured, but exit code 1
  r = await cli(['toolchain', '--docker', 'other/ise:1'], { extraEnv: { ...withTools, FAKE_DOCKER_NO_IMAGE: '1' } });
  assert.equal(r.code, 1);
  assert.match(r.out, /^ISE \(docker\): NOT available - docker image 'other\/ise:1' not present locally/m);
  // no docker at all
  await fs.writeFile(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify({ docker: { command: path.join(tmp, 'no-docker') } }));
  r = await cli(['toolchain', '--docker', 'x/y']);
  assert.equal(r.code, 1);
  assert.match(r.out, /command not found/);
  await fs.rm(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'));
});

// ------------------------------------------------------------------------------------------------
// serve
// ------------------------------------------------------------------------------------------------

test('serve: starts on the given port with the scratch workspace and opens the browser with --open', { skip: POSIX_ONLY }, async () => {
  const s = await serveOnFreePort((p) => ['serve', '--port', String(p), '--host', '127.0.0.1', '--open'], /Keep this window open/);
  const { port } = s;
  try {
    assert.match(s.out(), new RegExp(`Silinx running at http://127.0.0.1:${port} {2}\\(workspace: ${process.env.SILINX_WORKSPACE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`));
    // the API needs the token made at this start (#2564): printed, opened, and in the configuration folder
    const token = /Open it at http:\/\/127\.0\.0\.1:\d+\/#token=([\w-]+)$/m.exec(s.out())?.[1];
    assert.ok(token, s.out());
    assert.equal(fss.readFileSync(path.join(process.env.SILINX_CONFIG_DIR, `server-${port}.token`), 'utf8'), token);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/projects`)).status, 403);
    const r = await fetch(`http://127.0.0.1:${port}/api/projects`, { headers: { 'X-Silinx-Token': token } });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(await r.json()));
    for (let i = 0; i < 300 && !fss.existsSync(env.FAKE_OPEN_LOG); i++) await sleep(10);
    // the browser opened with a one-time code, never the token on the opener's command line (#2955); nor the code: the
    // opener is given a page of the configuration folder, its owner's only, that leads to the address with it (#3409)
    const opened = await fs.readFile(env.FAKE_OPEN_LOG, 'utf8');
    const pageOf = log => new RegExp(`^(?:open|xdg-open) (${process.env.SILINX_CONFIG_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/open-[\\w-]+\\.html)$`, 'm').exec(log)?.[1];
    const first = pageOf(opened);
    assert.ok(first, opened);
    assert.ok(!opened.includes('code=') && !opened.includes(token));
    assert.equal(fss.statSync(first).mode & 0o777, 0o600);
    assert.match(fss.readFileSync(first, 'utf8'), new RegExp(`location\\.replace\\("http://127\\.0\\.0\\.1:${port}/#code=[\\w-]{24}"\\)`));
    // a second launch (the launcher double-clicked twice): "already running" (the server proved it holds the token of
    // its file), and opens it with a code of its own
    await fs.rm(env.FAKE_OPEN_LOG, { force: true });
    const again = await cli(['serve', '--port', String(port), '--open']);
    assert.equal(again.code, 0, again.err);
    assert.match(again.out, new RegExp(`^Silinx is already running at http://127.0.0.1:${port}$`, 'm'));
    for (let i = 0; i < 300 && !fss.existsSync(env.FAKE_OPEN_LOG); i++) await sleep(10);
    const second = pageOf(await fs.readFile(env.FAKE_OPEN_LOG, 'utf8'));
    const code = /#code=([\w-]+)/.exec(fss.readFileSync(second, 'utf8'))?.[1];
    assert.ok(code);
    const page = { method: 'POST', headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' }, body: JSON.stringify({ code }) };
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/token`, page)).json(), { token });
  } finally { await stop(s.proc); }
  await fs.rm(env.FAKE_OPEN_LOG, { force: true });
  // PORT from the environment, host 0.0.0.0 shown as 127.0.0.1 in the URL
  const s2 = await serveOnFreePort(() => ['serve', '--host', '0.0.0.0'], /Keep this window open/, { env: (p) => ({ PORT: String(p) }) });
  const port2 = s2.port;
  try {
    assert.match(s2.out(), new RegExp(`Silinx running at http://0.0.0.0:${port2}`));
    const token2 = /\/#token=([\w-]+)$/m.exec(s2.out())?.[1];
    assert.equal((await fetch(`http://127.0.0.1:${port2}/api/templates`)).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${port2}/api/templates`, { headers: { 'X-Silinx-Token': token2 } })).status, 200);
  } finally { await stop(s2.proc); }
});

test('serve: port already used by another program -> exit 1, a server that answers everything or has no token too', { skip: POSIX_ONLY }, async () => {
  // (#2955: a server answering 200 was taken for a running Silinx and the browser opened there; and one without the
  // token of the file in the configuration folder, which is never sent to it)
  const seen = [];
  const answers = http.createServer((req, res) => { seen.push(req.headers['x-silinx-token']); res.setHeader('content-type', 'application/json'); res.end('[]'); });
  await new Promise(r => answers.listen(0, '127.0.0.1', r));
  const aport = answers.address().port;
  await fs.writeFile(path.join(process.env.SILINX_CONFIG_DIR, `server-${aport}.token`), 'stale-token-of-a-crashed-run');
  const app = await startApp();
  try {
    for (const port of [aport, app.port]) {
      await fs.rm(env.FAKE_OPEN_LOG, { force: true });
      const r = await cli(['serve', '--port', String(port), '--open']);
      assert.equal(r.code, 1);
      assert.match(r.err, new RegExp(`^Port ${port} is used by another program\\. Start Silinx on another port: node bin/silinx.js serve --port ${port + 1}$`, 'm'));
      assert.doesNotMatch(r.out, /already running/);
      assert.ok(!fss.existsSync(env.FAKE_OPEN_LOG), 'no browser opened');
    }
    assert.ok(!seen.includes('stale-token-of-a-crashed-run'), 'the token is never sent to it');
  } finally {
    await app.close();
    answers.closeAllConnections?.();
    await new Promise(r => answers.close(r));
    await fs.rm(path.join(process.env.SILINX_CONFIG_DIR, `server-${aport}.token`), { force: true });
  }

  const other = http.createServer((req, res) => { res.statusCode = 404; res.end('nope'); });
  await new Promise(r => other.listen(0, '127.0.0.1', r));
  const port = other.address().port;
  try {
    const r = await cli(['serve', '--port', String(port)]);
    assert.equal(r.code, 1);
    assert.match(r.err, new RegExp(`Port ${port} is used by another program\\. Start Silinx on another port: node bin/silinx.js serve --port ${port + 1}`));
  } finally {
    other.closeAllConnections?.();
    await new Promise(r => other.close(r));
  }
  // any other listen error is fatal (exit 1, message on stderr)
  const r = await cli(['serve', '--port', '99999']);
  assert.equal(r.code, 1);
  assert.match(r.err, /^silinx: .*(port|99999)/im);
});
