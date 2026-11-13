// The MCP server's long runs are bounded (#3408): simulate stops at its time limit (timeout_s) and at its number of
// time steps, with its warning and its data's limit; max_changes, timeout_s and the changes returned in all are
// bounded, as run_process's timeout_s and log_lines; a request the client cancels (notifications/cancelled) stops its
// simulation and is not answered, and the server answers the next one at once. A test bench with a 1 ps clock: a
// simulation of a second of it would run for days.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import { scratchEnv } from './server-helpers.js';

let tmp;
const { handle, serveMcp } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };

const TB = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture s of tb is
  signal clk: std_logic := '0';
  signal n: unsigned(7 downto 0) := (others => '0');
begin
  clk <= not clk after 1 ps;
  process(clk) begin if rising_edge(clk) then n <= n + 1; end if; end process;
end;
`;

before(async () => {
  tmp = await scratchEnv('silinx-mcp-sim-limits-');
  await ok('new_project', { name: 'd' });
  await ok('write_file', { project: 'd', path: 'sim/tb.vhd', text: TB });
  await ok('set_top', { project: 'd', sim_top: 'tb' });
  await ok('new_project_from_example', { name: 'g', example: 'gates' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('#3408 simulate: a run within its limits as before, no limit in its data', async () => {
  const r = await ok('simulate', { project: 'd', time_ns: 0.01, signals: ['n'] });
  assert.equal(r.data.limit, null);
  assert.equal(r.data.stoppedAtNs, 0.01);
  assert.equal(r.data.signals.n.totalChanges, 6);
  assert.equal(r.text, 'Simulation of <tb> stopped at 0.01 ns.\nn = "00000101" (6 changes)');
});

test('#3408 simulate: stopped at its time limit, with its warning and its data; the server goes on', async () => {
  const t0 = Date.now();
  const r = await ok('simulate', { project: 'd', time_ns: 1e9, signals: ['n'], timeout_s: 1 });
  assert.ok(Date.now() - t0 < 15000, `stopped after ${Date.now() - t0} ms`);
  assert.deepEqual(r.data.limit, { kind: 'time', seconds: 1 });
  assert.equal(r.data.finished, null);
  assert.ok(r.data.stoppedAtNs > 0 && r.data.stoppedAtNs < 1e9, String(r.data.stoppedAtNs));
  const lines = r.text.split('\n');
  assert.equal(lines[0], `Simulation of <tb> stopped at ${r.data.stoppedAtNs} ns.`);
  assert.equal(lines[1], 'WARNING: the simulation stopped at its time limit (1 s), before 1000000000 ns: a shorter time_ns, or a longer timeout_s (at most 600).');
  assert.match(lines[2], /^n = "[01]{8}" \(\d+ changes\)$/);
  assert.equal(lines.length, 3);
  await ok('simulate', { project: 'g', top: 'gates', time_ns: 10 });
});

test('#3408 simulate: stopped at its number of time steps', async () => {
  const { runBounded, SIM_LIMITS } = await import('../server/mcp-hdl.js');
  assert.equal(SIM_LIMITS.steps, 20_000_000);
  const { compile, elaborate } = await import('../core/compile.js');
  const { Simulator } = await import('../core/simulator.js');
  const sim = new Simulator(elaborate(compile([{ path: 'tb.vhd', text: TB }]), 'tb'));
  const { st, limit } = await runBounded(sim, 1e12, { timeoutS: 60, steps: 100_000 });
  assert.equal(limit, 'steps');
  assert.equal(st.now, 100_000, 'a step a picosecond (after time 0)');
  // the run to its end within the limits: no limit
  const s2 = new Simulator(elaborate(compile([{ path: 'tb.vhd', text: TB }]), 'tb'));
  assert.deepEqual((await runBounded(s2, 50_000, { timeoutS: 60, steps: 100_000 })).limit, null);
  assert.equal(s2.now, 50_000);
});

test('#3408 simulate: max_changes, timeout_s and the changes returned in all are bounded', async () => {
  for (const max_changes of [0, -1, 1001, 1e9]) await fails('simulate', { project: 'd', max_changes }, 'max_changes: from 1 to 1000');
  for (const timeout_s of [0, -1, 601]) await fails('simulate', { project: 'd', timeout_s }, 'timeout_s: from 1 to 600 s');
  // (not an integer: refused by the schema's check, #3535)
  await fails('simulate', { project: 'd', max_changes: 2.5 }, 'max_changes: an integer');
  await fails('simulate', { project: 'd', timeout_s: 1.5 }, 'timeout_s: an integer');
  await fails('simulate', { project: 'd', signals: Array(101).fill('n'), max_changes: 1000 }, 'signals × max_changes: at most 100,000 changes returned (101 signals × 1000): fewer signals, or a smaller max_changes');
  const r = await ok('simulate', { project: 'd', time_ns: 0.05, signals: ['n'], max_changes: 1000 });
  assert.equal(r.data.signals.n.changes.length, 26);
});

test('#3408 run_process: timeout_s and log_lines are bounded', async () => {
  for (const timeout_s of [-1, 0, 7201]) await fails('run_process', { project: 'g', process: 'synthesize', timeout_s }, 'timeout_s: from 1 to 7200 s');
  await fails('run_process', { project: 'g', process: 'synthesize', timeout_s: 0.5 }, 'timeout_s: an integer');
  for (const log_lines of [0, -5, 1001]) await fails('run_process', { project: 'g', process: 'synthesize', log_lines }, 'log_lines: from 1 to 1000');
});

test('#3408 a cancelled simulation stops and is not answered; the next request is answered at once', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const served = serveMcp({ input, output });
  const answers = [];
  let buf = '';
  output.on('data', d => { buf += d; for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) answers.push(JSON.parse(buf.slice(0, i))); });
  const send = m => input.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  const until = async (cond, ms) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await new Promise(r => setTimeout(r, 20)); return cond(); };
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.ok(await until(() => answers.length === 1, 5000));
  send({ id: 2, method: 'tools/call', params: { name: 'simulate', arguments: { project: 'd', time_ns: 1e9, timeout_s: 600 } } });
  send({ id: 3, method: 'tools/call', params: { name: 'simulate', arguments: { project: 'd', time_ns: 1e9, timeout_s: 600 } } });
  await new Promise(r => setTimeout(r, 500));
  const t0 = Date.now();
  send({ method: 'notifications/cancelled', params: { requestId: 2, reason: 'too long' } });
  send({ method: 'notifications/cancelled', params: { requestId: 3 } });   // (waiting: never started)
  send({ id: 4, method: 'ping' });
  assert.ok(await until(() => answers.some(a => a.id === 4), 10000), 'the ping answered');
  assert.ok(Date.now() - t0 < 10000);
  assert.deepEqual(answers.map(a => a.id), [1, 4], 'the cancelled requests not answered');
  input.end();
  await served;
});

// (the heap's live objects: a collection first, by the gc that --expose-gc gives, set here for this file)
import v8 from 'node:v8';
import vm from 'node:vm';
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const liveMb = () => { gc(); return process.memoryUsage().heapUsed / 1048576; };

test('#3503 simulate: a long run in bounded memory, the waves kept as the changes returned; its warnings; with a VCD, every change', async () => {
  // (the issue's case: a 32-bit counter on a 1 ps clock, 1500 changes a ns, the recording's limit at 3333 ns before)
  await ok('new_project', { name: 'mem' });
  await ok('write_file', { project: 'mem', path: 'sim/tb.vhd', text: TB.replace('7 downto 0', '31 downto 0') });
  await ok('set_top', { project: 'mem', sim_top: 'tb' });
  const before = liveMb();
  let peak = before;
  // (the heap looked at between the run's chunks, which give the event loop its turn every 50 ms)
  const probe = setInterval(() => { peak = Math.max(peak, liveMb()); }, 250);
  let r;
  try { r = await ok('simulate', { project: 'mem', time_ns: 1e9, timeout_s: 5, max_changes: 5 }); } finally { clearInterval(probe); }
  const after = liveMb();
  assert.equal(r.data.limit.kind, 'time');
  assert.ok(r.data.stoppedAtNs > 100, `stopped at ${r.data.stoppedAtNs} ns`);
  // (each change of the run before the limit: before, 5,000,000 at most kept, about 500 MB of it)
  assert.ok(peak - before < 64, `the heap grew by ${Math.round(peak - before)} MB during the run (${r.data.stoppedAtNs} ns)`);
  assert.ok(after - before < 16, `the heap kept ${Math.round(after - before)} MB after the run`);
  // the warnings: the time limit's only (no recording's limit: the end of the run is in its waves)
  assert.deepEqual(r.text.split('\n').filter(l => /^WARNING/.test(l)), ['WARNING: the simulation stopped at its time limit (5 s), before 1000000000 ns: a shorter time_ns, or a longer timeout_s (at most 600).']);
  assert.deepEqual(r.data.log, []);
  // the changes returned: the last 5 of each, every change counted (the counter's value at the end, its changes in all)
  const { clk, n } = r.data.signals;
  assert.equal(n.changes.length, 5);
  assert.equal(clk.changes.length, 5);
  assert.ok(n.changes.at(-1)[0] <= r.data.stoppedAtNs && n.changes.at(-1)[0] > r.data.stoppedAtNs - 0.01, JSON.stringify(n.changes));
  assert.match(n.final, /^x"[0-9A-F]+"$/i);
  assert.equal(parseInt(n.final.replace(/^x"|"$/g, ''), 16), n.totalChanges - 1, 'the counter counts its own changes (its first value 0)');
  assert.ok(Math.abs(clk.totalChanges - 2 * n.totalChanges) <= 2, `${clk.totalChanges} clock changes, ${n.totalChanges} of n`);
  // with a VCD: every change written (a short run), as before
  process.env.SILINX_MCP_FOLDER = `${tmp}/exchange`;
  fs.mkdirSync(process.env.SILINX_MCP_FOLDER);
  const vcd = 'mem.vcd';
  const r2 = await ok('simulate', { project: 'mem', time_ns: 0.02, max_changes: 3, vcd });
  assert.equal(r2.data.signals.n.totalChanges, 11);
  assert.equal(r2.data.signals.n.changes.length, 3);
  assert.equal(fs.readFileSync(`${tmp}/exchange/${vcd}`, 'utf8').split('\n').filter(l => /^b\d+ /.test(l)).length, 11);
});
