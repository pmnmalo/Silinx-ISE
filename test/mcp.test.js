// The MCP server (#134): `silinx-ise mcp` spoken to over stdin / stdout as an MCP client does
// (JSON-RPC 2.0, one message a line): the handshake, the tools and their schemas, each tool on the
// examples with the exact results (Check Syntax's errors and warnings, a simulation, the power process
// and its report), the protocol's errors, the paths kept inside their project (symbolic links too) and
// the ISE machine's address never in a result.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_ORDER } from '../core/examples.js';
import { VERSION } from '../core/version.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let tmp, ws, srv;

// a client of `silinx-ise mcp`: send(msg) -> its answer (by id); call(tool, args) -> the result
function startMcp(env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'bin/silinx-ise.js'), 'mcp'], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map(), lines = [];
  let buf = '', stderr = '', id = 0;
  p.stdout.on('data', d => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      lines.push(line);
      const m = JSON.parse(line);   // (every line of stdout is a JSON-RPC message)
      waiting.get(m.id)?.(m); waiting.delete(m.id);
    }
  });
  p.stderr.on('data', d => { stderr += d; });
  const raw = (text, key) => new Promise(resolve => { waiting.set(key, resolve); p.stdin.write(`${text}\n`); });
  const send = (method, params) => { const k = ++id; return raw(JSON.stringify({ jsonrpc: '2.0', id: k, method, ...(params ? { params } : {}) }), k); };
  const call = async (name, args = {}) => { const m = await send('tools/call', { name, arguments: args }); assert.ok(m.result, JSON.stringify(m)); return m.result; };
  const close = () => new Promise(resolve => { p.on('close', resolve); p.stdin.end(); });
  return { p, send, call, raw, close, lines, stderr: () => stderr };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-mcp-'));
  ws = path.join(tmp, 'ws');
  fs.mkdirSync(path.join(tmp, 'cfg'), { recursive: true });
  // the Silinx toolchain, and an ISE machine configured (its address never in a result)
  fs.writeFileSync(path.join(tmp, 'cfg', 'config.json'), JSON.stringify({ mode: 'silinx', ssh: { user: 'someone', host: 'ise-host.example.test' } }));
  srv = startMcp({ SILINX_WORKSPACE: ws, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') });
});
after(async () => { await srv?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('the handshake: the protocol version, the server, its tools with their schemas; ping', async () => {
  const init = await srv.send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.serverInfo, { name: 'silinx-ise', title: 'Silinx ISE', version: VERSION });
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.match(init.result.instructions, /The Silinx toolchain needs no Xilinx ISE\./);
  // an older client's version is answered with it; an unknown one with the newest
  assert.equal((await srv.send('initialize', { protocolVersion: '2024-11-05' })).result.protocolVersion, '2024-11-05');
  assert.equal((await srv.send('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18');
  srv.p.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');   // (a notification: no answer)
  const { tools } = (await srv.send('tools/list')).result;
  assert.deepEqual(tools.map(t => t.name), ['list_examples', 'list_projects', 'new_project_from_example', 'new_project', 'set_top', 'project_info', 'read_file', 'write_file', 'check_syntax', 'simulate', 'run_process', 'get_report']);
  for (const t of tools) {
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.ok(t.description.length > 40 && t.title, t.name);
    assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
    for (const r of t.inputSchema.required || []) assert.ok(t.inputSchema.properties[r], `${t.name}: ${r}`);
  }
  assert.deepEqual(tools.find(t => t.name === 'run_process').inputSchema.properties.process.enum, ['synthesize', 'implement', 'bitstream', 'timing', 'power', 'pins']);
  assert.deepEqual((await srv.send('ping')).result, {});
});

test('the protocol\'s errors: a line that is not JSON, an unknown method, an unknown tool; a tool\'s wrong arguments are its result', async () => {
  assert.deepEqual(await srv.raw('{not json', null), { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
  assert.deepEqual((await srv.send('resources/list')).error, { code: -32601, message: 'method not found: resources/list' });
  assert.deepEqual((await srv.send('tools/call', { name: 'format_disk', arguments: {} })).error, { code: -32602, message: 'unknown tool \'format_disk\'' });
  assert.deepEqual(await srv.call('read_file', { project: 'x' }), { content: [{ type: 'text', text: 'read_file: missing path' }], isError: true });
  assert.deepEqual(await srv.call('list_projects', { verbose: true }), { content: [{ type: 'text', text: 'list_projects: unknown verbose' }], isError: true });
});

test('the examples, a new project from one (for another board too), the projects, a project\'s settings', async () => {
  const ex = await srv.call('list_examples');
  assert.deepEqual(ex.structuredContent.examples.map(e => e.name), EXAMPLE_ORDER);
  assert.deepEqual(ex.structuredContent.examples.find(e => e.name === 'blinky'), { name: 'blinky', top: 'top', simTop: 'tb_top', board: 'basys2', device: 'xc3s250ecp132-4', files: 7 });
  assert.equal((await srv.call('list_projects')).content[0].text, 'No project in the workspace (new_project_from_example makes one).');
  const made = await srv.call('new_project_from_example', { name: 'Blinky', example: 'blinky' });
  assert.equal(made.content[0].text, 'Project \'Blinky\' made from the example blinky: top top, basys2 (xc3s250ecp132-4).');
  assert.ok(fs.existsSync(path.join(ws, 'Blinky', 'silinx.json')));
  // for the Nexys2-500: its device and its pins
  const nx = await srv.call('new_project_from_example', { name: 'TrafficN', example: 'traffic', board: 'nexys2', variant: '500' });
  assert.deepEqual(nx.structuredContent.device, { family: 'spartan3e', part: 'xc3s500e', package: 'fg320', speed: '-4' });
  assert.match(fs.readFileSync(path.join(ws, 'TrafficN', 'constraints', 'traffic.ucf'), 'utf8'), /on Digilent Nexys2/);
  // refused: a name taken, an unknown example or board variant
  assert.deepEqual(await srv.call('new_project_from_example', { name: 'Blinky', example: 'gates' }), { content: [{ type: 'text', text: 'new_project_from_example: project \'Blinky\' already exists' }], isError: true });
  assert.equal((await srv.call('new_project_from_example', { name: 'X', example: 'nope' })).content[0].text, 'new_project_from_example: unknown example \'nope\' (list_examples)');
  assert.equal((await srv.call('new_project_from_example', { name: 'X', example: 'gates', board: 'basys2', variant: '500' })).content[0].text, 'new_project_from_example: the Digilent Basys2 has no variant \'500\'');
  assert.deepEqual((await srv.call('list_projects')).structuredContent.projects, [
    { name: 'Blinky', top: 'top', board: 'basys2', device: 'xc3s250ecp132-4' }, { name: 'TrafficN', top: 'top', board: 'nexys2', device: 'xc3s500efg320-4' }]);
  const info = await srv.call('project_info', { project: 'Blinky' });
  assert.equal(info.structuredContent.simTop, 'tb_top');
  assert.deepEqual(info.structuredContent.files.map(f => `${f.path} ${f.lang} ${f.role}`), ['src/counter.v verilog design', 'src/knight.vhd vhdl design', 'src/speed_ctrl.vhd vhdl design', 'src/bcd_counter.vhd vhdl design', 'src/sevenseg.v verilog design', 'src/top.vhd vhdl design', 'sim/tb_top.vhd vhdl sim'].filter(l => info.structuredContent.files.some(f => l.startsWith(f.path))));
  assert.equal((await srv.call('project_info', { project: 'Nope' })).content[0].text, 'project_info: no project \'Nope\' in the workspace');
});

test('read_file / write_file: a source read and written, a new HDL file added to the project; Silinx\'s own files and paths out of the project refused (a symbolic link too)', async () => {
  const top = (await srv.call('read_file', { project: 'Blinky', path: 'src/top.vhd' })).content[0].text;
  assert.equal(top, fs.readFileSync(path.join(ROOT, 'examples/blinky/src/top.vhd'), 'utf8'));
  const w = await srv.call('write_file', { project: 'Blinky', path: 'src/inv.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture rtl of inv is begin y <= not a; end rtl;\n' });
  assert.equal(w.content[0].text, 'Created src/inv.vhd (164 characters), added to the project.');
  assert.ok(JSON.parse(fs.readFileSync(path.join(ws, 'Blinky', 'silinx.json'), 'utf8')).files.some(f => f.path === 'src/inv.vhd' && f.role === 'design'));
  assert.equal((await srv.call('write_file', { project: 'Blinky', path: 'silinx.json', text: '{}' })).content[0].text, 'write_file: \'silinx.json\' is written by Silinx itself');
  assert.equal((await srv.call('write_file', { project: 'Blinky', path: 'build/top.bit', text: 'x' })).content[0].text, 'write_file: \'build/top.bit\' is written by Silinx itself');
  // #1233: the same files spelt otherwise; a source spelt otherwise is written and listed once, by its plain path
  for (const p of ['./silinx.json', 'src/../silinx.json', 'src//../silinx.json', './build/top.bit', 'build', 'src/../build/x.v'])
    assert.equal((await srv.call('write_file', { project: 'Blinky', path: p, text: '{}' })).content[0].text, `write_file: '${p}' is written by Silinx itself`);
  assert.equal((await srv.call('write_file', { project: 'Blinky', path: './src//inv.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture rtl of inv is begin y <= not a; end rtl;\n' })).content[0].text, 'Wrote src/inv.vhd (164 characters).');
  const listed = JSON.parse(fs.readFileSync(path.join(ws, 'Blinky', 'silinx.json'), 'utf8'));
  assert.deepEqual(listed.files.filter(f => f.path.includes('inv')).map(f => f.path), ['src/inv.vhd']);
  assert.equal(listed.name, 'Blinky');
  for (const [tool, args] of [['read_file', { path: '../TrafficN/silinx.json' }], ['read_file', { path: '/etc/hosts' }], ['write_file', { path: '../../escape.vhd', text: 'x' }]]) {
    const r = await srv.call(tool, { project: 'Blinky', ...args });
    assert.deepEqual(r, { content: [{ type: 'text', text: `${tool}: path escapes project` }], isError: true }, `${tool} ${args.path}`);
  }
  // a symbolic link in the project to a folder outside it
  fs.mkdirSync(path.join(tmp, 'outside'));
  fs.writeFileSync(path.join(tmp, 'outside', 'secret.txt'), 'secret');
  fs.symlinkSync(path.join(tmp, 'outside'), path.join(ws, 'Blinky', 'link'), process.platform === 'win32' ? 'junction' : 'dir');   // (a junction: no rights needed on Windows)
  assert.equal((await srv.call('read_file', { project: 'Blinky', path: 'link/secret.txt' })).content[0].text, 'read_file: path escapes project');
  assert.equal((await srv.call('write_file', { project: 'Blinky', path: 'link/new.vhd', text: 'x' })).content[0].text, 'write_file: path escapes project');
  assert.equal(fs.readdirSync(path.join(tmp, 'outside')).join(), 'secret.txt');
  fs.rmSync(path.join(ws, 'Blinky', 'link'));
});

test('check_syntax: the design as the application checks it, then an error and a warning with their file and line', async () => {
  const ok = await srv.call('check_syntax', { project: 'Blinky' });
  assert.equal(ok.content[0].text, 'Process "Check Syntax" of <top> completed successfully (51 signals, 24 processes).');
  assert.deepEqual(ok.structuredContent, { project: 'Blinky', top: 'top', ok: true, errors: [], warnings: [] });
  assert.equal((await srv.call('check_syntax', { project: 'Blinky', simulation: true })).structuredContent.top, 'tb_top');
  // a missing ';' and an unused signal
  await srv.call('write_file', { project: 'Blinky', path: 'src/inv.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture rtl of inv is\n  signal spare : std_logic;\nbegin\n  y <= not a\nend rtl;\n' });
  const bad = await srv.call('check_syntax', { project: 'Blinky', top: 'inv' });
  assert.equal(bad.structuredContent.ok, false);
  assert.deepEqual(bad.structuredContent.errors.map(e => [e.file, e.line, e.message]), [['src/inv.vhd', 6, 'expected \';\' after \'a\'']]);
  assert.match(bad.content[0].text, /^ERROR:HDLCompiler - "src\/inv\.vhd" Line 6: expected ';' after 'a'\n/);
  assert.match(bad.content[0].text, /Process "Check Syntax" of <inv> failed \(1 error\(s\), 0 warning\(s\)\)\.$/);
  // a latch, and a signal assigned but never used: the design checks' warnings
  await srv.call('write_file', { project: 'Blinky', path: 'src/inv.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture rtl of inv is\n  signal spare : std_logic;\nbegin\n  y <= not a;\n  process (a) begin if a = \'1\' then spare <= a; end if; end process;\nend rtl;\n' });
  const warn = await srv.call('check_syntax', { project: 'Blinky', top: 'inv' });
  assert.deepEqual(warn.structuredContent.warnings.map(w => [w.file, w.line, w.check]), [['src/inv.vhd', 7, 'latch'], ['src/inv.vhd', 4, 'unused-signal']]);
  assert.match(warn.structuredContent.warnings[0].message, /^Found 1-bit latch for signal <spare>\./);
  assert.match(warn.content[0].text, /completed successfully with 2 warning\(s\)/);
  assert.equal((await srv.call('check_syntax', { project: 'Blinky', top: 'nothere' })).structuredContent.ok, false);
});

test('simulate: the test bench\'s signals, their last changes, its messages; a design that does not compile does not start; unknown signals refused', async () => {
  const s = await srv.call('simulate', { project: 'Blinky', time_ns: 2000, max_changes: 3 });
  assert.equal(s.isError, false);
  const d = s.structuredContent;
  assert.equal(d.top, 'tb_top');
  assert.equal(d.stoppedAtNs, 2000);
  assert.deepEqual(Object.keys(d.signals), ['clk', 'sw', 'btn', 'led', 'seg', 'dp', 'an']);
  assert.equal(d.signals.clk.width, 1);
  assert.equal(d.signals.clk.changes.length, 3);
  assert.equal(d.signals.clk.totalChanges, 201);   // 20 ns period from 0: a change every 10 ns
  assert.match(s.content[0].text, /^Simulation of <tb_top> stopped at 2000 ns\.\nclk = [01] \(201 changes\)\nsw = "0000"/m);
  // a signal inside the design, by its path
  const inner = await srv.call('simulate', { project: 'Blinky', time_ns: 100, signals: ['uut/led'] });
  assert.deepEqual(Object.keys(inner.structuredContent.signals), ['uut/led']);
  assert.equal((await srv.call('simulate', { project: 'Blinky', signals: ['nosuch'] })).content[0].text, 'simulate: no signal \'nosuch\' in <tb_top> (names of the top, or paths as uut/count)');
  assert.equal((await srv.call('simulate', { project: 'Blinky', time_ns: 0 })).content[0].text, 'simulate: time_ns: from 0 to 1e9 ns');
  // the test bench of stopwatch: its own report messages
  await srv.call('new_project_from_example', { name: 'Stopwatch', example: 'stopwatch' });
  const sw = await srv.call('simulate', { project: 'Stopwatch', time_ns: 5e6 });
  assert.ok(sw.structuredContent.log.length > 0, sw.content[0].text);
  assert.equal(sw.structuredContent.failed, false, sw.content[0].text);
  // does not compile: no simulation, the errors
  await srv.call('write_file', { project: 'Stopwatch', path: 'src/stopwatch.vhd', text: 'entity broken is end' });
  const no = await srv.call('simulate', { project: 'Stopwatch' });
  assert.equal(no.isError, true);
  assert.equal(no.structuredContent.started, false);
  assert.match(no.content[0].text, /The simulation of <tb_stopwatch> did not start: \d+ error\(s\) \(check_syntax with simulation\)\.$/);
});

test('run_process and get_report: the power estimate of blinky with the Silinx toolchain, its report and the Design Summary; refused without a project; the ISE machine\'s address redacted', { timeout: 300000 }, async () => {
  assert.equal((await srv.call('get_report', { project: 'TrafficN' })).content[0].text, 'No report yet for \'TrafficN\': run a process (run_process).');
  const r = await srv.call('run_process', { project: 'Blinky', process: 'power', log_lines: 5 });
  assert.equal(r.isError, false, r.content[0].text);
  assert.equal(r.structuredContent.toolchain, 'silinx');
  assert.equal(r.structuredContent.ok, true);
  assert.deepEqual(r.structuredContent.errors, []);
  assert.match(r.content[0].text, /Estimated power: [\d.]+ mW \(dynamic [\d.]+ mW, static [\d.]+ mW\), junction [\d.]+ C: build\/top\.pwr \(an estimate, not Xilinx XPower\)/);
  assert.match(r.content[0].text, /Process "power" of <top> completed successfully( with \d+ warning\(s\))? \(Silinx toolchain\)\.$/);
  assert.equal(r.structuredContent.log.length, 5);
  const pwr = await srv.call('get_report', { project: 'Blinky', report: 'power' });
  assert.match(pwr.content[0].text, /^Silinx toolchain - estimated power \(not Xilinx XPower\)\n/);
  assert.equal(pwr.structuredContent.path, 'build/top.pwr');
  const sum = await srv.call('get_report', { project: 'Blinky' });
  assert.equal(sum.structuredContent.summary.source, 'open');
  assert.equal(sum.structuredContent.summary.par.routed, true);
  // the Silinx toolchain's reports (#460: they were looked for as ISE's files): Yosys's statistics for the
  // synthesis, the pack and route summaries for map and par
  const syn = await srv.call('get_report', { project: 'Blinky', report: 'synthesis' });
  assert.deepEqual(syn.structuredContent, { project: 'Blinky', report: 'synthesis', toolchain: 'silinx', path: 'build/open/top_stat.txt', available: true });
  assert.match(syn.content[0].text, /\n=== top ===\n[\s\S]*\n +\d+ cells\n[\s\S]* FDRE\n/);
  const map = await srv.call('get_report', { project: 'Blinky', report: 'map' });
  assert.equal(map.structuredContent.path, 'build/reports.json');
  assert.match(map.content[0].text, /^Design summary \(pack, Silinx toolchain\) of top:\n {2}Number of Slice Flip Flops: \d+ out of 4896 \d+%\n(?: {2}.*\n)+0 error\(s\), 0 warning\(s\)\.$/);
  const par = await srv.call('get_report', { project: 'Blinky', report: 'par' });
  assert.match(par.content[0].text, /^Place and route \(Silinx toolchain\) of top: all signals are completely routed \(\d+ nets, \d+ PIPs(, \d+ passes)?\)\.\nTiming constraints: all met; minimum period [\d.]+ ns \([\d.]+ MHz\)\.$/);
  assert.equal((await srv.call('get_report', { project: 'Blinky', report: 'timing' })).structuredContent.path, 'build/open/timing.txt');
  assert.equal((await srv.call('get_report', { project: 'Blinky', report: 'pins' })).content[0].text, 'No pins report for \'Blinky\' from its last run (Silinx toolchain: build/top_pins.ucf): run_process pins first.');
  assert.equal((await srv.call('get_report', { project: 'TrafficN', report: 'map' })).content[0].text, 'No map report for \'TrafficN\': no process has run yet (run_process implement).');
  assert.equal((await srv.call('get_report', { project: 'Blinky', report: 'netlist' })).content[0].text, 'get_report: report: summary or one of power, timing, synthesis, map, par, pins');
  assert.equal((await srv.call('run_process', { project: 'Nope', process: 'implement' })).content[0].text, 'run_process: no project \'Nope\' in the workspace');
  assert.equal((await srv.call('run_process', { project: 'Blinky', process: 'erase' })).content[0].text, 'run_process: process: one of synthesize, implement, bitstream, timing, power, pins');
  // a report that names the ISE machine (as an ISE run's log would): its address replaced
  fs.writeFileSync(path.join(ws, 'Blinky', 'build', 'top.pwr'), 'ssh someone@ise-host.example.test: done on ise-host.example.test\n');
  assert.equal((await srv.call('get_report', { project: 'Blinky', report: 'power' })).content[0].text, 'ssh <ISE host>: done on <ISE host>\n');
  // nothing on stdout but the protocol's messages; the server's own lines (if any) on stderr
  for (const l of srv.lines) assert.equal(JSON.parse(l).jsonrpc, '2.0');
  assert.ok(!srv.lines.some(l => l.includes('ise-host.example.test')), 'the ISE host never in a result');
});

test('new_project and set_top: an empty project for a board, its source written, its top and test bench chosen, its constraints from the board\'s pins; implemented (#460)', { timeout: 120000 }, async () => {
  const made = await srv.call('new_project', { name: 'Counter4', board: 'basys2', variant: '100' });
  assert.equal(made.content[0].text, 'Empty project \'Counter4\' made: basys2 (xc3s100ecp132-4). Write its sources with write_file, then set_top.');
  assert.deepEqual(made.structuredContent.device, { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' });
  assert.equal((await srv.call('new_project', { name: 'Counter4' })).content[0].text, 'new_project: project \'Counter4\' already exists');
  assert.equal((await srv.call('new_project', { name: 'X', board: 'zedboard' })).content[0].text, 'new_project: unknown board \'zedboard\' (basys2, nexys2)');
  assert.equal((await srv.call('new_project', { name: 'X', board: 'nexys2', variant: '250' })).content[0].text, 'new_project: the Digilent Nexys2 has no variant \'250\'');
  const bare = await srv.call('new_project', { name: 'Bare' });
  assert.equal(bare.content[0].text, 'Empty project \'Bare\' made: no board (xc3s250ecp132-4). Write its sources with write_file, then set_top.');
  await srv.call('write_file', { project: 'Counter4', path: 'src/counter.vhd', text: 'library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\nentity counter is\n  port (clk, btn : in std_logic; led : out std_logic_vector(3 downto 0));\nend counter;\narchitecture rtl of counter is\n  signal c : unsigned(3 downto 0) := (others => \'0\');\nbegin\n  process (clk) begin\n    if rising_edge(clk) then\n      if btn = \'1\' then c <= (others => \'0\'); else c <= c + 1; end if;\n    end if;\n  end process;\n  led <= std_logic_vector(c);\nend rtl;\n' });
  await srv.call('write_file', { project: 'Counter4', path: 'sim/tb_counter.vhd', text: 'library ieee;\nuse ieee.std_logic_1164.all;\nentity tb_counter is end;\narchitecture t of tb_counter is\n  signal clk, btn : std_logic := \'0\';\n  signal led : std_logic_vector(3 downto 0);\nbegin\n  uut: entity work.counter port map (clk, btn, led);\n  clk <= not clk after 10 ns;\n  process begin wait for 105 ns; assert led = "0101" report "led wrong" severity error; report "done"; wait; end process;\nend;\n' });
  // refused: nothing to set, a module that is not there, a test bench as the top, constraints without a board
  assert.equal((await srv.call('set_top', { project: 'Counter4' })).content[0].text, 'set_top: give top, sim_top or both');
  assert.equal((await srv.call('set_top', { project: 'Counter4', top: 'nothere' })).content[0].text, 'set_top: no entity or module \'nothere\' in the project\'s design sources (project_info)');
  assert.equal((await srv.call('set_top', { project: 'Counter4', top: 'tb_counter' })).content[0].text, 'set_top: no entity or module \'tb_counter\' in the project\'s design sources (project_info)');
  assert.equal((await srv.call('set_top', { project: 'Nope', top: 'counter' })).content[0].text, 'set_top: no project \'Nope\' in the workspace');
  await srv.call('write_file', { project: 'Bare', path: 'src/inv.v', text: 'module inv(input a, output y); assign y = ~a; endmodule\n' });
  assert.equal((await srv.call('set_top', { project: 'Bare', top: 'inv', update_constraints: true })).content[0].text, 'set_top: the project \'Bare\' has no board: its constraints cannot come from a board\'s pins');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ws, 'Bare', 'silinx.json'), 'utf8')).top, '', 'nothing changed');
  // the top and the test bench, the constraints from the Basys2's pins
  const set = await srv.call('set_top', { project: 'Counter4', top: 'counter', sim_top: 'tb_counter', update_constraints: true });
  assert.equal(set.content[0].text, 'Counter4: top counter, test bench tb_counter; constraints/top.ucf written from the basys2\'s pins.');
  assert.deepEqual(set.structuredContent, { project: 'Counter4', top: 'counter', simTop: 'tb_counter', constraintsUpdated: true });
  const ucf = fs.readFileSync(path.join(ws, 'Counter4', 'constraints', 'top.ucf'), 'utf8');
  assert.match(ucf, /^# UCF for top 'counter' on Digilent Basys2 \(xc3s100e-4-cp132\), generated by Silinx\n/);
  const locs = ucf.split('\n').filter(l => / LOC = "\w+" ;$/.test(l)).map(l => /^NET "([^"]+)"/.exec(l)[1]);
  assert.deepEqual(locs, ['clk', 'btn', 'led<0>', 'led<1>', 'led<2>', 'led<3>']);
  assert.match(ucf, /TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;/);
  // its test bench simulated, the counter implemented with no warning
  const sim = await srv.call('simulate', { project: 'Counter4', time_ns: 200 });
  assert.deepEqual(sim.structuredContent.log, [{ timeNs: 105, kind: 'note', text: 'done' }]);
  assert.equal(sim.structuredContent.failed, false);
  const impl = await srv.call('run_process', { project: 'Counter4', process: 'implement', log_lines: 3 });
  assert.equal(impl.isError, false, impl.content[0].text);
  assert.deepEqual([impl.structuredContent.errors, impl.structuredContent.warnings], [[], []]);
  assert.match(impl.content[0].text, /Process "implement" of <counter> completed successfully \(Silinx toolchain\)\.$/);
  assert.match((await srv.call('get_report', { project: 'Counter4', report: 'map' })).content[0].text, /^Design summary \(pack, Silinx toolchain\) of counter:\n {2}Number of Slice Flip Flops: 4 out of 1920 0%\n/);
});

// Regression (#2420): the nextpnr engine counts no router passes (iterations null), and the summary said "null passes"
test('the place and route summary: the router\'s passes only when the engine counts them', async () => {
  const { OPEN_REPORTS } = await import('../server/mcp.js');
  const r = iterations => ({ top: 'top', par: { routed: true, nets: 304, pips: 2161, iterations }, timing: { met: true, minPeriodNs: 7.117, maxFreqMHz: 140.509 } });
  assert.equal(OPEN_REPORTS.par(r(null)), 'Place and route (Silinx toolchain) of top: all signals are completely routed (304 nets, 2161 PIPs).\nTiming constraints: all met; minimum period 7.117 ns (140.509 MHz).');
  assert.equal(OPEN_REPORTS.par(r(undefined)).split('\n')[0], 'Place and route (Silinx toolchain) of top: all signals are completely routed (304 nets, 2161 PIPs).');
  assert.equal(OPEN_REPORTS.par(r(3)).split('\n')[0], 'Place and route (Silinx toolchain) of top: all signals are completely routed (304 nets, 2161 PIPs, 3 passes).');
  assert.equal(OPEN_REPORTS.par({ top: 'top', par: { routed: false, unroutedSignals: 2, nets: 10, pips: 50, iterations: 40 } }), 'Place and route (Silinx toolchain) of top: 2 signal(s) not routed (10 nets, 50 PIPs, 40 passes).');
});
