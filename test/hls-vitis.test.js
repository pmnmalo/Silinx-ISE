// AMD's Vitis HLS as the HLS corpus's oracle (#1624, scripts/hls-vitis.mjs): the config a design runs with, the parsing
// of Vitis's reports (hand-written snippets in their format, 2025.2's, not Vitis's files), the comparison of the ports with
// Silinx's and the README's table. No Vitis: the comparison itself runs on the ISE runner's machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vitisConfig, elements, parseCsynth, parseCosim, parseStatus, comparePorts, compareDesign, vitisTable, selectDesigns, keepsRun, modulesOf, silinxModules, PART } from '../scripts/hls-vitis.mjs';
import { cToHdl } from '../core/c-hdl.js';

test('#1624 the config: the part fixed, the Vivado flow, no packaging nor Vivado run; the rest kept', () => {
  const cfg = 'part=xcvu9p-flga2104-2-i\n\n[hls]\nflow_target=vitis\npackage.output.format=ip_catalog\npackage.output.syn=false\nsyn.file=a.c\ntb.file=a_test.c\nsyn.top=f\nclock=4\nvivado.flow=impl\ncosim.trace_level=all\n';
  const out = vitisConfig(cfg);
  assert.equal(out, `part=${PART}\n\n[hls]\nflow_target=vivado\nsyn.file=a.c\ntb.file=a_test.c\nsyn.top=f\nclock=4\n`);
  assert.equal(vitisConfig('syn.top=f\nsyn.file=a.c', { part: 'xc7s25csga324-1' }), 'part=xc7s25csga324-1\nflow_target=vivado\nsyn.top=f\nsyn.file=a.c\n');
  assert.equal(vitisConfig(''), `part=${PART}\nflow_target=vivado\n`);
});

const CSYNTH = `<?xml version="1.0" encoding="UTF-8"?>
<profile>
  <UserAssignments><Part>xc7a35t-cpg236-1</Part><TopModelName>f</TopModelName></UserAssignments>
  <PerformanceEstimates>
    <SummaryOfOverallLatency>
      <Best-caseLatency>12</Best-caseLatency>
      <Average-caseLatency>20</Average-caseLatency>
      <Worst-caseLatency>34</Worst-caseLatency>
      <Interval-min>13</Interval-min>
      <Interval-max>35</Interval-max>
    </SummaryOfOverallLatency>
    <SummaryOfLoopLatency>
      <outer>
        <Slack>2.92</Slack>
        <TripCount>4</TripCount>
        <isPerfectNested>0</isPerfectNested>
        <Latency><range><min>8</min><max>32</max></range></Latency>
        <AbsoluteTimeLatency>-</AbsoluteTimeLatency>
        <IterationLatency><range><min>2</min><max>8</max></range></IterationLatency>
        <PipelineDepth>-</PipelineDepth>
        <InstanceList/>
        <VITIS_LOOP_12_1>
          <Slack>2.92</Slack>
          <TripCount><range><min>0</min><max>6</max></range></TripCount>
          <Latency><range><min>0</min><max>6</max></range></Latency>
          <PipelineII>1</PipelineII>
          <PipelineDepth>2</PipelineDepth>
          <InstanceList/>
        </VITIS_LOOP_12_1>
      </outer>
    </SummaryOfLoopLatency>
  </PerformanceEstimates>
  <InterfaceSummary>
    <RtlPorts><name>ap_clk</name><Object>f</Object><Type>return value</Type><IOProtocol>ap_ctrl_hs</IOProtocol><Bits>1</Bits><Dir>in</Dir></RtlPorts>
    <RtlPorts><name>ap_start</name><Object>f</Object><Type>return value</Type><IOProtocol>ap_ctrl_hs</IOProtocol><Bits>1</Bits><Dir>in</Dir></RtlPorts>
    <RtlPorts><name>x</name><Object>x</Object><Type>scalar</Type><IOProtocol>ap_none</IOProtocol><Bits>32</Bits><Dir>in</Dir></RtlPorts>
    <RtlPorts><name>y</name><Object>y</Object><Type>pointer</Type><IOProtocol>ap_vld</IOProtocol><Bits>16</Bits><Dir>out</Dir></RtlPorts>
    <RtlPorts><name>y_ap_vld</name><Object>y</Object><Type>pointer</Type><IOProtocol>ap_vld</IOProtocol><Bits>1</Bits><Dir>out</Dir></RtlPorts>
  </InterfaceSummary>
</profile>
`;

test('#1624 csynth.xml: the latency and interval, the loops (nested, a range, a pipelined one\'s II), the ports', () => {
  const r = parseCsynth(CSYNTH);
  assert.deepEqual(r.latency, { min: 12, max: 34 });
  assert.deepEqual(r.interval, { min: 13, max: 35 });
  assert.deepEqual(r.loops, [
    { name: 'outer', line: null, trip: { min: 4, max: 4 }, latency: { min: 8, max: 32 }, ii: null, iterationLatency: { min: 2, max: 8 } },
    { name: 'VITIS_LOOP_12_1', line: 12, trip: { min: 0, max: 6 }, latency: { min: 0, max: 6 }, ii: 1, iterationLatency: null },
  ]);
  assert.deepEqual(r.ports.map((p) => [p.name, p.dir, p.w, p.protocol, p.object]), [
    ['ap_clk', 'in', 1, 'ap_ctrl_hs', 'f'], ['ap_start', 'in', 1, 'ap_ctrl_hs', 'f'], ['x', 'in', 32, 'ap_none', 'x'],
    ['y', 'out', 16, 'ap_vld', 'y'], ['y_ap_vld', 'out', 1, 'ap_vld', 'y'],
  ]);
});

// (csynth.xml's RTL hierarchy, as Vitis HLS 2025.2 writes it: each instance's name and module, nested in its caller's)
const HIER = `<profile><RTLDesignHierarchy><TopModule><ModuleName>top</ModuleName><InstancesList>
<Instance><InstName>grp_big_fu_80</InstName><ModuleName>big</ModuleName><ID>1</ID><BindInstances>add_ln5_fu_30</BindInstances>
<InstancesList><Instance><InstName>grp_leaf_fu_20</InstName><ModuleName>leaf</ModuleName><ID>2</ID></Instance></InstancesList></Instance>
<Instance><InstName>grp_big_fu_90</InstName><ModuleName>big</ModuleName><ID>3</ID></Instance>
</InstancesList></TopModule></RTLDesignHierarchy></profile>`;

test('#2244 csynth.xml\'s RTL hierarchy: each instance, its module and the module it is in; none recorded: null', () => {
  const want = [{ module: 'big', instance: 'grp_big_fu_80', of: 'top' }, { module: 'leaf', instance: 'grp_leaf_fu_20', of: 'big' }, { module: 'big', instance: 'grp_big_fu_90', of: 'top' }];
  assert.deepEqual(modulesOf(HIER), want);
  assert.deepEqual(parseCsynth(HIER).modules, want);
  assert.deepEqual(modulesOf('<profile><RTLDesignHierarchy><TopModule><ModuleName>f</ModuleName></TopModule></RTLDesignHierarchy></profile>'), []);
  assert.equal(parseCsynth(CSYNTH).modules, null);
  // (Silinx's: its report's functions, the same shape)
  const g = cToHdl('int leaf(int x) {\n#pragma HLS INLINE off\n  int s = 0;\n  for (int i = 0; i < x; i++) s += i;\n  return s;\n}\nint top(int a) { return leaf(a) + 1; }\n', { file: 't.c', top: 'top' });
  assert.deepEqual(silinxModules(g), [{ module: 'leaf', instance: 'leaf_U0', of: 'top' }]);
});

test('#1624 the element tree: nested elements, empty ones, each one\'s inner text; two loops side by side', () => {
  const r = elements('<a><b>1</b><c/><d><e> x </e></d></a>');
  assert.deepEqual(r.children.map((x) => x.tag), ['a']);
  assert.deepEqual(r.children[0].children.map((x) => [x.tag, x.text, x.children.length]), [['b', '1', 0], ['c', '', 0], ['d', '<e> x </e>', 1]]);
  assert.equal(r.children[0].children[2].children[0].text, 'x');
  const two = parseCsynth('<SummaryOfLoopLatency><read><TripCount>8</TripCount><Latency>16</Latency><PipelineII>2</PipelineII></read><VITIS_LOOP_30_2><TripCount>8</TripCount><Latency>9</Latency><PipelineII>1</PipelineII></VITIS_LOOP_30_2></SummaryOfLoopLatency>');
  assert.deepEqual(two.loops.map((l) => [l.name, l.line, l.trip.max, l.latency.max, l.ii]), [['read', null, 8, 16, 2], ['VITIS_LOOP_30_2', 30, 8, 9, 1]]);
});

test('#1624 csynth.xml: an undefined latency (a loop of unknown trip count), no loops, no ports; an empty report', () => {
  const r = parseCsynth('<profile><SummaryOfOverallLatency><Best-caseLatency>3</Best-caseLatency><Worst-caseLatency>undef</Worst-caseLatency><Interval-min>4</Interval-min><Interval-max>undef</Interval-max></SummaryOfOverallLatency></profile>');
  assert.deepEqual(r, { latency: { min: 3, max: null }, interval: { min: 4, max: null }, loops: [], ports: [], modules: null });
  assert.deepEqual(parseCsynth(''), { latency: null, interval: null, loops: [], ports: [], modules: null });
});

const COSIM = `
===============================================================
--------------------------------------------------------------
+----------+----------+-----------------------------------------------+-----------------------------------------------+----------------------+
|          |          |             Latency(Clock Cycles)             |              Interval(Clock Cycles)           | Total Execution Time |
+   RTL    +  Status  +-----------------------------------------------+-----------------------------------------------+    (Clock Cycles)    +
|          |          |      min      |      avg      |      max      |      min      |      avg      |      max      |                      |
+----------+----------+-----------------------------------------------+-----------------------------------------------+----------------------+
|      VHDL|        NA|             NA|             NA|             NA|             NA|             NA|             NA|                    NA|
|   Verilog|      Pass|             10|           12.5|             15|             11|             13|             16|                    55|
+----------+----------+-----------------------------------------------+-----------------------------------------------+----------------------+
`;

test('#1624 the co-simulation report: the Verilog row\'s status and latency; a failure; the VHDL row; none run', () => {
  assert.deepEqual(parseCosim(COSIM), { status: 'pass', latency: { min: 10, avg: 12.5, max: 15 } });
  assert.deepEqual(parseCosim(COSIM.replace('|      Pass|', '|      Fail|')), { status: 'fail', latency: { min: 10, avg: 12.5, max: 15 } });
  const vhdl = COSIM.replace(/\|\s+VHDL\|\s+NA\|.*\n/, '|      VHDL|      Pass|              3|              3|              3|              4|              4|              4|                    12|\n').replace(/\|\s+Verilog\|.*\n/, '|   Verilog|        NA|             NA|             NA|             NA|             NA|             NA|             NA|                    NA|\n');
  assert.deepEqual(parseCosim(vhdl), { status: 'pass', latency: { min: 3, avg: 3, max: 3 } });
  assert.deepEqual(parseCosim(COSIM.replace('|      Pass|             10|           12.5|             15|', '|      Pass|             NA|             NA|             NA|')), { status: 'pass', latency: null });
  assert.deepEqual(parseCosim(''), { status: null, latency: null });
});

test('#1624 the status: each step\'s exit code; the C simulation failed by its log\'s errors; steps not run skipped', () => {
  assert.deepEqual(parseStatus('csim 0\nsynth 0\ncosim 0\n', 'INFO: [SIM 1] CSim done with 0 errors.\n'), { csim: 'pass', synth: 'pass', cosim: 'pass' });
  assert.deepEqual(parseStatus('csim 1\nsynth 2\n'), { csim: 'fail', synth: 'fail', cosim: 'skip' });
  assert.deepEqual(parseStatus('csim 0\nsynth 0\ncosim 124\n', 'INFO: [SIM 1] CSim done with 2 errors.\n'), { csim: 'fail', synth: 'pass', cosim: 'fail' });
  assert.deepEqual(parseStatus('csim 0\n', 'ERROR: [SIM 211-100] \'csim_design\' failed: nonzero return value.\n'), { csim: 'fail', synth: 'skip', cosim: 'skip' });
  assert.deepEqual(parseStatus(''), { csim: 'skip', synth: 'skip', cosim: 'skip' });
});

test('#1624 the ports compared by name: the same; missing, extra, a direction or a width that differs', () => {
  const v = parseCsynth(CSYNTH).ports;
  const s = v.map(({ name, dir, w }) => ({ name, dir, w }));
  assert.deepEqual(comparePorts(s, v), { same: true, missing: [], extra: [], differ: [] });
  const s2 = [...s.filter((p) => p.name !== 'y_ap_vld').map((p) => (p.name === 'x' ? { ...p, w: 16 } : p.name === 'y' ? { ...p, dir: 'in' } : p)), { name: 'ap_rst', dir: 'in', w: 1 }];
  assert.deepEqual(comparePorts(s2, v), { same: false, missing: ['y_ap_vld'], extra: ['ap_rst'], differ: [{ name: 'x', vitis: 'in 32', silinx: 'in 16' }, { name: 'y', vitis: 'out 16', silinx: 'in 16' }] });
});

test('#1624 a design compared: Silinx\'s ports (cToHdl) against a Vitis report written from them; the README\'s table', () => {
  const g = cToHdl('void f(int x, short *y) { *y = x + 1; }', { file: 'f.c', top: 'f' });
  assert.ok(g.ok, JSON.stringify(g.diagnostics));
  const xml = `<profile>${g.ports.map((p) => `<RtlPorts><name>${p.name}</name><Bits>${p.w}</Bits><Dir>${p.dir}</Dir></RtlPorts>`).join('')}</profile>`;
  const vitis = { ...parseStatus('csim 0\nsynth 0\ncosim 0\n'), ...parseCsynth(xml), latency: { min: 0, max: 0 }, loops: [{ name: 'VITIS_LOOP_3_1', line: 3, ii: 1 }] };
  const silinx = { csim: 'pass', synth: 'pass', cosim: 'pass', latency: { min: 1, max: 2 }, loops: [{ name: null, line: 3, ii: 2, cycles: 9 }], ports: g.ports.map(({ name, dir, w }) => ({ name, dir, w })) };
  const r = compareDesign(vitis, silinx);
  assert.equal(r.ports.same, true);
  assert.equal(compareDesign({ ...vitis, ports: [] }, silinx).ports, null);
  const t = vitisTable({ designs: [{ name: 'f' }, { name: 'not-run' }] }, { f: r, g: { ...r, vitis: { ...vitis, csim: 'fail', loops: [] }, ports: comparePorts(silinx.ports.slice(1), vitis.ports) } }, { image: 'xilinx/vitis-hls:2025.2' });
  const lines = t.split('\n');
  assert.equal(lines[0], `Vitis HLS (xilinx/vitis-hls:2025.2, ${PART}) against Silinx HLS: the C simulation, the ports, the latency (cycles) and the loops' II (Vitis's pipelined loops).`);
  assert.deepEqual(lines.filter((l) => l.startsWith('| f ')), ['| f | pass / pass | pass / pass | same | 0 / 1-2 | VITIS_LOOP_3_1 1 / 2 |']);
  assert.ok(!t.includes('not-run'));
  assert.equal(lines.at(-1), '2 designs: 1 through Vitis\'s C simulation, 1 with Silinx\'s ports the same as Vitis\'s.');
});

test('#1780 --filter: a regular expression on the names; a plain name as a substring; no filter, every design; a bad one throws', () => {
  const designs = ['modeling-pointers-basic-arithmetic', 'modeling-pointers-stream-good', 'pipelining-loops-perfect-loop', 'dsp-fft-interface-array'].map((name) => ({ name }));
  const names = (f) => selectDesigns(designs, f).map((d) => d.name);
  assert.deepEqual(names('pointer'), ['modeling-pointers-basic-arithmetic', 'modeling-pointers-stream-good']);
  assert.deepEqual(names('^(modeling-pointers-stream|pipelining-loops)-'), ['modeling-pointers-stream-good', 'pipelining-loops-perfect-loop']);
  assert.deepEqual(names('^(dsp-fft-interface-array|modeling-pointers-basic-arithmetic)$'), ['modeling-pointers-basic-arithmetic', 'dsp-fft-interface-array']);
  assert.deepEqual(names(''), designs.map((d) => d.name));
  assert.deepEqual(names(undefined), designs.map((d) => d.name));
  assert.deepEqual(names('^none$'), []);
  assert.throws(() => names('('), SyntaxError);
});

test('#1826 --collect keeps the run on the host unless --update saved its results', () => {
  assert.equal(keepsRun(['--collect', 'silinx-vitis-abc']), true);
  assert.equal(keepsRun(['--collect', 'silinx-vitis-abc', '--update']), false);
  assert.equal(keepsRun(['--update', '--collect', 'silinx-vitis-abc']), false);
  // main() deletes the host's folder only after the --update block wrote vitis.json and the README's table
  const src = fs.readFileSync(new URL('../scripts/hls-vitis.mjs', import.meta.url), 'utf8');
  const rm = src.indexOf('rm -rf ${remoteOf(collect)}'), written = src.indexOf("README's Vitis table updated");
  assert.ok(rm > 0 && written > 0 && rm > written);
  assert.doesNotMatch(src, /`\$\{work\}\/`\]\);\n\s*ssh\(`rm -rf/, 'no deletion right after the fetch');
});

test('#2855 a design with an RTL blackbox: the ports compared are those Silinx HLS makes with its description (optionsOf, as runDesign)', async () => {
  const { optionsOf, runDesign } = await import('./hls-corpus/lib.mjs');
  const { cToHdl } = await import('../core/c-hdl.js');
  const design = { name: 'bb', language: 'c++', top: 'top', files: ['d/top.cpp'], tb: ['d/tb.cpp'], headers: [],
    blackbox: { descriptions: ['d/adder.json'], files: ['d/adder.v', 'd/adder_model.cpp'] } };
  const texts = {
    'd/top.cpp': '#include "ap_int.h"\nvoid adder(ap_uint<8> a, ap_uint<8> b, ap_uint<8> &z);\nvoid top(ap_uint<8> a, ap_uint<8> b, ap_uint<8> &s) { ap_uint<8> t; adder(a, b, t); s = t; }\n',
    'd/tb.cpp': 'int main() { ap_uint<8> s; top(2, 3, s); return s == 5 ? 0 : 1; }\n',
    'd/adder_model.cpp': '#include "ap_int.h"\nvoid adder(ap_uint<8> a, ap_uint<8> b, ap_uint<8> &z) { z = a + b; }\n',
    'd/adder.v': 'module adder_rtl(input clk, input [7:0] a, b, output reg [7:0] z);\n  always @(posedge clk) z <= a + b;\nendmodule\n',
    'd/adder.json': JSON.stringify({ c_function_name: 'adder', rtl_top_module_name: 'adder_rtl', c_files: [{ c_file: 'adder_model.cpp', cflag: '' }], rtl_files: ['adder.v'],
      c_parameters: [{ c_name: 'a', c_port_direction: 'in', rtl_ports: { data_read_in: 'a' } }, { c_name: 'b', c_port_direction: 'in', rtl_ports: { data_read_in: 'b' } }, { c_name: 'z', c_port_direction: 'out', rtl_ports: { data_write_out: 'z' } }],
      rtl_common_signal: { module_clock: 'clk' }, rtl_performance: { latency: '1' } }),
  };
  const { unit, opts } = optionsOf(design, texts);
  assert.deepEqual(opts.blackboxes.map((b) => b.file), ['d/adder.json']);
  // (the script's own synthesis had none: 'adder' declared, not defined, and no ports to compare)
  const g = cToHdl(unit, { ...opts, lang: 'vhdl' });
  assert.equal(g.ok, true);
  assert.deepEqual(g.diagnostics.filter((d) => d.severity === 'warning'), []);
  const vitis = [['ap_clk', 'in', 1], ['ap_rst', 'in', 1], ['ap_start', 'in', 1], ['ap_done', 'out', 1], ['ap_idle', 'out', 1], ['ap_ready', 'out', 1],
    ['a', 'in', 8], ['b', 'in', 8], ['s', 'out', 8], ['s_ap_vld', 'out', 1]].map(([name, dir, w]) => ({ name, dir, w }));
  assert.deepEqual(comparePorts(g.ports, vitis), { same: true, missing: [], extra: [], differ: [] });
  assert.deepEqual(runDesign(design, texts), { csim: 'pass', synth: 'pass', cosim: 'pass', latency: runDesign(design, texts).latency, reason: null });
});
