// The reports of the families nextpnr times (#2300, #2674: what the interface's Design Summary, Static Timing Report and its
// Paths panel show) through the server and the MCP server: the blinky example on the iCEBreaker, the ULX3S and the Tang Nano 9K,
// run_process timing (its exact warnings), get_report's summary (the utilization, nextpnr's timing) and its timing report,
// timing_paths' slowest path back to the example's source lines, and between two registers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-nextpnr-reports-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

// each board's: nextpnr's name, the part, the utilization's rows, the warnings of the timing process (the iCEBreaker's PCF has no pin
// for three of the LEDs; the Gowin's nets nextpnr routes through the general routing), the clock's constraint
const IO = ['Critical path from the inputs to clock clk', 'Critical path from clock clk to the outputs', 'Critical path from the inputs to the outputs'];
const BOARDS = [
  { board: 'icebreaker', tool: 'nextpnr-ice40', part: 'ice40up5ksg48', mhz: 12, util: ['ICESTORM_LC', 'SB_GB', 'SB_IO'], io: IO,
    warnings: [...[5, 6, 7].map(i => `WARNING:Place - the port led[${i}] has no pin (set_io in the PCF): nextpnr places it anywhere.`),
      ...[7, 6, 5].map(i => `WARNING:Place - IO 'led[${i}]' is unconstrained in PCF and will be automatically placed`)] },
  { board: 'ulx3s', tool: 'nextpnr-ecp5', part: 'lfe5u-85f-6cabga381', mhz: 25, util: ['DCCA', 'TRELLIS_COMB', 'TRELLIS_FF', 'TRELLIS_IO'], io: IO, warnings: [] },
  { board: 'tangnano9k', tool: 'nextpnr-himbaechel-gowin', part: 'gw1nr-9c-6qn88', mhz: 27, util: ['ALU', 'DFF', 'IOB', 'LUT4', 'MUX2_LUT5'], io: [],
    // (the switches read through swOn, #3710: before, sw_IBUF_I_O[2]'s)
    warnings: ['X11Y26/C6', 'X11Y26/C2', 'X11Y26/C7', 'X9Y26/C6', 'X10Y26/C6', 'X8Y26/C6', 'X8Y26/C7', 'X11Y26/C5'].map(t => `WARNING:Place - Failed to route net 'swon[1]' from X28Y28/F6 to ${t} using dedicated routing.`) },
];

for (const b of BOARDS) {
  test(`${b.board}: run_process timing, get_report's utilization and nextpnr's timing, timing_paths back to the example's lines`, { timeout: 600000 }, async () => {
    const name = `t-${b.board}`;
    await ok('new_project_from_example', { name, example: 'blinky' });
    await ok('set_design_properties', { project: name, board: b.board, update_constraints: true });
    const run = await ok('run_process', { project: name, process: 'timing' });
    assert.deepEqual(run.data.warnings, b.warnings);
    assert.match(run.text, new RegExp(`\\nTiming \\(${b.tool}'s analysis\\): all constraints met, minimum period [\\d.]+ ns \\([\\d.]+ MHz\\)\\.\\nTiming report: build/open/timing\\.txt\\n`));
    const build = path.join(P.projectDir(name), 'build', 'open');
    for (const f of ['nextpnr-report.json', 'timing.txt', 'paths.json']) assert.ok(fs.existsSync(path.join(build, f)), f);
    // the Design Summary: nextpnr's resources (the Gowin's without its constants), its timing
    const summary = (await ok('get_report', { project: name })).data.summary;
    assert.deepEqual(summary.map.utilization.map(u => u.name), b.util);
    const t = summary.timing;
    assert.deepEqual([t.met, t.timingErrors, t.engine, t.clocks.map(c => [c.clock, c.constraintMHz])], [true, 0, 'nextpnr', [['clk', b.mhz]]]);
    assert.deepEqual(t.constraints.map(c => [c.name, c.constraint, c.timingErrors]), [['clock clk', `clk at ${b.mhz} MHz (${(1000 / b.mhz).toFixed(3)} ns)`, 0]]);
    assert.deepEqual([summary.summary.timingMet, summary.summary.maxFreqMHz], [true, t.maxFreqMHz]);
    // the Static Timing Report
    const report = await ok('get_report', { project: name, report: 'timing' });
    assert.equal(report.data.path, 'build/open/timing.txt');
    const lines = report.text.split('\n');
    assert.deepEqual(lines.slice(0, 3), [`Static timing of top on ${b.part} after Place & Route: ${b.tool}'s timing analysis (its report), the worst path of each clock.`, '',
      `Clock clk: ${t.maxFreqMHz} MHz (${t.minPeriodNs.toFixed(3)} ns), constraint ${b.mhz} MHz (${(1000 / b.mhz).toFixed(3)} ns): met, slack ${t.constraints[0].slackNs.toFixed(3)} ns`]);
    assert.match(lines[4], /^Critical path of clock clk: [\d.]+ ns, required [\d.]+ ns, slack [\d.]+ ns$/);
    // (the paths through the I/O: nextpnr-ice40's and nextpnr-ecp5's, the switches to the LEDs; nextpnr-himbaechel's report none)
    assert.deepEqual(lines.filter(l => /^Critical path from/.test(l)).map(l => l.replace(/: [\d.]+ ns$/, '')), b.io);
    assert.equal(lines.at(-2), 'All constraints were met.');
    // timing_paths: the slowest path (nextpnr's critical path of clk), its stages back to the example's VHDL and Verilog
    const list = await ok('timing_paths', { project: name });
    assert.equal(list.data.toolchain, 'silinx');
    assert.equal(list.data.paths.length, 1);
    const [p] = list.data.paths;
    assert.deepEqual([p.clock, p.required, p.slack], ['clk', +(1000 / b.mhz).toFixed(3), +(p.required - p.delay).toFixed(3)]);
    assert.match(list.text, new RegExp(`^path 1: \\S+ -> \\S+, clock clk: ${p.delay.toFixed(3)} ns, required ${p.required.toFixed(3)} ns, slack ${p.slack.toFixed(3)} ns$`));
    const one = await ok('timing_paths', { project: name, path: 1 });
    const stages = one.data.path.stages;
    assert.deepEqual([stages[0].kind, stages.at(-1).kind], ['clock-to-out', 'setup']);
    const files = Object.keys(one.data.highlight.files);
    assert.ok(files.length && files.every(f => /^src\/\w+\.(vhd|v)$/.test(f)), files.join());
    assert.ok(one.data.highlight.sites.every(s => /^X\d+Y\d+$/.test(s)));
    // (the path starts in the speed control, whose VHDL is generated from its ASM chart: the chart's boxes on it)
    assert.deepEqual(Object.keys(one.data.highlight.drawings), ['src/speed_ctrl.asm.json']);
    assert.ok(one.data.highlight.drawings['src/speed_ctrl.asm.json'].length);
    assert.equal(one.text.split('\n').length, 1 + stages.length + 1);
    assert.match(one.text.split('\n').at(-1), /^ {2}in src\/speed_ctrl\.asm\.json: box /);
    // (between two registers: the path's own)
    const [from] = one.data.registers;
    const between = await ok('timing_paths', { project: name, from });
    assert.ok(between.data.paths.every(x => x.fromRegister === from));
  });
}
