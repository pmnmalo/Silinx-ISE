// UI (#1528): the C editor's C Simulation (main() run: its output in the Console) and C/RTL Co-simulation (main()'s
// calls of the top function replayed on its HDL: PASS, the latency of a sequential one; a failing C simulation said);
// the buttons in Portuguese; both interfaces. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const GCD = `#include <stdio.h>
unsigned gcd(unsigned a, unsigned b) {
  while (b != 0) {
#pragma HLS LOOP_TRIPCOUNT max=64
    unsigned t = b;
    b = a >= b ? a - b : b - a;
    a = t;
    if (b > a) { t = a; a = b; b = t; }
  }
  return a;
}
int main(void) {
  printf("gcd(48, 18) = %u\\n", gcd(48, 18));
  printf("gcd(100, 75) = %u\\n", gcd(100, 75));
  return 0;
}
`;
const BAD = `int f(int a) { return a; }
int main(void) {
  int z = 0;
  return f(1) / z;
}
`;

uiTest('#1528 the C editor: C Simulation (main()\'s output), C/RTL Co-simulation (PASS, the latency); a failing run said; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CSim', top: '', files: { 'src/gcd.c': GCD, 'src/bad.c': BAD } });
  await page.openProject('CSim');
  await page.showMessages();
  await page.eval(() => window.SilinxApp.openFile('src/gcd.c'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gcd.c' && window.Silinx.active.editor);
  const btn = (t) => page.click('.doc:not([hidden]) .editor-bar .btn', { text: t });
  await btn('C Simulation');
  await page.waitConsole(/Process "C Simulation" completed successfully/);
  let log = await page.consoleText();
  assert.match(log, /Started : "C Simulation" of src\/gcd\.c\.\n[\s\S]*gcd\(48, 18\) = 6\ngcd\(100, 75\) = 25\nmain\(\) returned 0; 2 call\(s\) of 'gcd'\./);
  await btn('C/RTL Co-simulation');
  await page.waitConsole(/Process "C\/RTL Co-simulation" completed successfully/, { timeout: 60000 });
  log = await page.consoleText();
  assert.match(log, /C simulation: 2 call\(s\) of 'gcd' replayed on its VHDL\.\nLatency: \d+ to \d+ cycles \(average [\d.]+\)\.\n\nC\/RTL co-simulation PASS: 2 call\(s\), the same results/);
  // a C simulation that fails: where and why
  await page.eval(() => window.SilinxApp.openFile('src/bad.c'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/bad.c' && window.Silinx.active.editor);
  await btn('C Simulation');
  await page.waitConsole(/Process "C Simulation" failed/);
  assert.match(await page.consoleText(), /ERROR:SilinxC - "src\/bad\.c" line 4: division by zero/);
  // in Portuguese: the buttons
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .editor-bar .btn')].some((b) => b.textContent.trim() === 'Simulação de C'), [], { what: 'Portuguese' });
  assert.ok(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .editor-bar .btn')].some((b) => b.textContent.trim() === 'Co-simulação C/RTL')));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

const SUM = `#include <stdio.h>
int sum(int a[8], int n) {
  int s = 0;
  for (int i = 0; i < 8; i++) {
#pragma HLS PIPELINE II=1
    if (i < n) s += a[i] * a[7 - i];
  }
  for (int k = 0; k < 4; k++) s += k;
  return s;
}
int main(void) {
  int t[8] = {3, -1, 4, 1, -5, 9, 2, 6};
  printf("%d %d\\n", sum(t, 3), sum(t, 8));
  return 0;
}
`;

uiTest('#1531 a C module\'s processes (C Synthesis (HLS)): View C Synthesis Report (the module, its ports, its memories, each loop\'s II, its multipliers), C Simulation and C/RTL Co-simulation, in both views; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CProc', top: 'sum', files: { 'src/sum.c': SUM } });
  await page.openProject('CProc');
  await page.showMessages();
  await page.treeRow('#hier', 'sum');
  await page.treeRow('#procs', 'View C Synthesis Report', { dbl: true, exact: true });
  await page.waitConsole(/Process "View C Synthesis Report" completed successfully/);
  const log = await page.consoleText();
  assert.match(log, /C Synthesis Report of 'sum' \(src\/sum\.c, VHDL\)\n\nModule: sequential, ap_ctrl_hs \(ap_clk, ap_rst, ap_start \/ ap_done \/ ap_idle \/ ap_ready\), \d+ states, \d+ register bits\n/);
  assert.match(log, /Ports:\n {2}ap_clk {11}in {4}1 bit\n[\s\S]* {2}a_address0 {7}out {3}3 bits\n {2}a_ce0 {12}out {3}1 bit\n {2}a_q0 {13}in {3}32 bits\n/);
  assert.match(log, /Memories:\n {2}a {16}8 x 32 bits, ap_memory \(outside the module\)\n/);
  // (the second loop pipelined automatically, as Vitis HLS does, #1919)
  assert.match(log, /Loops:\n {2}line 4 {4}8 iterations; II=2, 18 cycles; pipelined, II=1 asked\n {2}line 8 {4}4 iterations; II=1, 5 cycles; pipelined automatically, as Vitis HLS does\n/);
  // (its multiplication a unit, #2125: its widths, its blocks, its uses)
  assert.match(log, /\nMultipliers: 1 unit, \d+ multiplier blocks?\n {2}mul_0 {11}\d+ x \d+ bits, \d+ blocks?; 1 use, 1 input multiplexed\n/);
  assert.match(log, /WARNING:SilinxC - "src\/sum\.c" line 4: #pragma HLS PIPELINE II=1: II=2 made \(the memory 'a' has one port, accessed 2 times an iteration\)/);
  await page.treeRow('#procs', 'C Simulation', { dbl: true, exact: true });
  await page.waitConsole(/Process "C Simulation" completed successfully/);
  assert.match(await page.consoleText(), /\n58 100\nmain\(\) returned 0; 2 call\(s\) of 'sum'\./);
  // the Simulation view: the same group
  await page.setView('sim');
  await page.treeRow('#procs', 'C/RTL Co-simulation', { dbl: true, exact: true });
  await page.waitConsole(/Process "C\/RTL Co-simulation" completed successfully/, { timeout: 60000 });
  assert.match(await page.consoleText(), /C\/RTL co-simulation PASS: 2 call\(s\), the same results/);
  await page.setView('impl');
  // in Portuguese: the group and its processes
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  const labels = await page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((x) => x.textContent.trim()));
  for (const l of ['Síntese de C (HLS)', 'Ver/Editar Fonte C', 'Simulação de C', 'Co-simulação C/RTL', 'Ver Relatório da Síntese de C', 'Ver HDL Gerado']) assert.ok(labels.includes(l), `${l}: ${labels.join(', ')}`);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

const DIAMOND = `#define N 4
static void scale(int in[N], int out[N], int k) { for (int i = 0; i < N; i++) out[i] = in[i] * k; }
static void add(int a[N], int b[N]) { for (int i = 0; i < N; i++) b[i] = a[i] + 1; }
void diamond(int vin[N], int vout[N], int k) {
  int t[N];
#pragma HLS DATAFLOW
  scale(vin, t, k);
  add(t, vout);
}
int main(void) {
  int a[N] = {1, 2, 3, 4}, b[N];
  diamond(a, b, 3);
  return b[3] == 13 ? 0 : 1;
}
`;

uiTest('#1965 View C Synthesis Report of a module with ap_ctrl_chain: its block protocol and ap_continue among its ports', E, async (page) => {
  await makeProject(env, { name: 'CChain', top: 'inc', files: { 'src/inc.c': 'int inc(int a) {\n#pragma HLS INTERFACE ap_ctrl_chain port=return\n  return a + 1;\n}\nint main(void) { return inc(1) == 2 ? 0 : 1; }\n' } });
  await page.openProject('CChain');
  await page.showMessages();
  await page.treeRow('#hier', 'inc');
  await page.treeRow('#procs', 'View C Synthesis Report', { dbl: true, exact: true });
  await page.waitConsole(/Process "View C Synthesis Report" completed successfully/);
  const log = await page.consoleText();
  assert.match(log, /ap_ctrl_chain \(ap_clk, ap_rst, ap_start \/ ap_done \/ ap_continue \/ ap_idle \/ ap_ready\)/);
  assert.match(log, /Ports:\n {2}ap_clk {11}in {4}1 bit\n[\s\S]* {2}ap_continue {6}in {4}1 bit\n/);
  assert.doesNotMatch(log, /WARNING:SilinxC/);
});

uiTest('#1960 View C Synthesis Report of a function not inlined: its calls, latency and resources; the warnings none', E, async (page) => {
  const src = 'int sum(int n) {\n#pragma HLS INLINE off\n  static int calls = 0;\n  calls = calls + 1;\n  int s = 0;\n  for (int i = 0; i < 8; i++) {\n#pragma HLS PIPELINE off\n    s += n + i;\n  }\n  return s;\n}\nint top(int a) { return sum(a) + sum(a + 1); }\nint main() { return top(1) == 80 ? 0 : 1; }\n';
  await makeProject(env, { name: 'CSub', top: 'top', files: { 'src/top.c': src } });
  await page.openProject('CSub');
  await page.showMessages();
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'View C Synthesis Report', { dbl: true, exact: true });
  await page.waitConsole(/Process "View C Synthesis Report" completed successfully/);
  const log = await page.consoleText();
  assert.match(log, /Functions \(the module's latency: \d+ cycles\):\n {2}sum_U0 {11}sum: 2 calls; latency \d+ cycles, \d+ states, \d+ register bits\n/);
  assert.doesNotMatch(log, /WARNING:SilinxC/);
});

uiTest('#1707 View C Synthesis Report of a DATAFLOW module: its processes (each a module, when each starts), its buffer between them; C/RTL Co-simulation PASS', E, async (page) => {
  await makeProject(env, { name: 'CDiamond', top: 'diamond', files: { 'src/diamond.c': DIAMOND } });
  await page.openProject('CDiamond');
  await page.showMessages();
  await page.treeRow('#hier', 'diamond');
  await page.treeRow('#procs', 'View C Synthesis Report', { dbl: true, exact: true });
  await page.waitConsole(/Process "View C Synthesis Report" completed successfully/);
  const log = await page.consoleText();
  assert.match(log, /\nModule: DATAFLOW, ap_ctrl_hs \(ap_clk, ap_rst, ap_start \/ ap_done \/ ap_idle \/ ap_ready\), 2 processes running at once\n/);
  assert.match(log, /Processes:\n {2}scale_U0 {9}scale: \d+ states, \d+ register bits\n {2}add_U1 {11}add: \d+ states, \d+ register bits; starts once scale is done\n/);
  assert.match(log, /Memories:\n {2}vin {14}4 x 32 bits, ap_memory \(outside the module\)\n {2}vout {13}4 x 32 bits, ap_memory \(outside the module\)\n {2}t {16}4 x 32 bits, a buffer between processes \(block RAM\)\n/);
  assert.doesNotMatch(log, /WARNING:SilinxC/);
  await page.setView('sim');
  await page.treeRow('#procs', 'C/RTL Co-simulation', { dbl: true, exact: true });
  await page.waitConsole(/Process "C\/RTL Co-simulation" completed successfully/, { timeout: 60000 });
  assert.match(await page.consoleText(), /C\/RTL co-simulation PASS: 1 call\(s\), the same results/);
  await page.setView('impl');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

const FREE = `#include "hls_stream.h"
void inc(hls::stream<int> &a, hls::stream<int> &b) { b.write(a.read() + 1); }
void dbl(hls::stream<int> &a, hls::stream<int> &b) { b.write(a.read() * 2); }
void free_run(hls::stream<int> &src, hls::stream<int> &dst) {
#pragma HLS INTERFACE ap_ctrl_none port=return
#pragma HLS DATAFLOW
  hls::stream<int> mid;
  inc(src, mid);
  dbl(mid, dst);
}
int main() {
  hls::stream<int> a, b;
  int t = 0;
  for (int i = 0; i < 3; i++) { a.write(i); free_run(a, b); t += b.read(); }
  return t == 12 ? 0 : 1;
}
`;

uiTest('#1900 View C Synthesis Report of a module with ap_ctrl_none: ap_clk and ap_rst only (no ap_start / ap_done / ap_idle / ap_ready), running by itself; C/RTL Co-simulation PASS', E, async (page) => {
  await makeProject(env, { name: 'CFree', top: 'free_run', files: { 'src/free_run.cpp': FREE } });
  await page.openProject('CFree');
  await page.showMessages();
  await page.treeRow('#hier', 'free_run');
  await page.treeRow('#procs', 'View C Synthesis Report', { dbl: true, exact: true });
  await page.waitConsole(/Process "View C Synthesis Report" completed successfully/);
  const log = await page.consoleText();
  assert.match(log, /\nModule: DATAFLOW, ap_ctrl_none \(ap_clk, ap_rst: running by itself\), 2 processes running at once\nTarget clock: 20 ns \(the board's oscillator\)\n\nPorts:\n {2}ap_clk {11}in {4}1 bit\n {2}ap_rst {11}in {4}1 bit\n {2}src_dout /);
  assert.doesNotMatch(log, /ap_start|WARNING:SilinxC/);
  await page.setView('sim');
  await page.treeRow('#procs', 'C/RTL Co-simulation', { dbl: true, exact: true });
  await page.waitConsole(/Process "C\/RTL Co-simulation" completed successfully/, { timeout: 60000 });
  assert.match(await page.consoleText(), /C\/RTL co-simulation PASS: 3 call\(s\), the same results/);
  await page.setView('impl');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

uiTest('#1852 C Simulation with the Console\'s filter on Design: its lines shown, the filter turned to Simulation', E, async (page) => {
  await makeProject(env, { name: 'CSimFilter', top: '', files: { 'src/gcd.c': GCD } });
  await page.openProject('CSimFilter');
  await page.showMessages();
  await page.eval(() => window.SilinxApp.openFile('src/gcd.c'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gcd.c' && window.Silinx.active.editor);
  await page.click('#mc-filters .filt[data-src="check"]');
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'C Simulation' });
  await page.waitConsole(/Process "C Simulation" completed successfully/);
  const st = await page.eval(() => ({
    hidden: [...document.getElementById('console-log').children].filter((l) => /gcd\(48, 18\) = 6|C Simulation/.test(l.textContent) && l.classList.contains('mc-off')).length,
    pressed: [...document.querySelectorAll('#mc-filters .filt[aria-pressed="true"]')].map((b) => b.dataset.src),
  }));
  assert.deepEqual(st, { hidden: 0, pressed: ['sim'] });
});

uiTest('#1855 the C editor\'s Templates ▾: Silinx HLS\'s templates (C++\'s in a .cpp source), one inserted at the cursor; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CTpl', top: '', files: { 'src/f.c': 'int f(int a) {\n  return a;\n}\n', 'src/g.cpp': 'int g(int a) {\n  return a;\n}\n' } });
  await page.openProject('CTpl');
  const items = () => page.eval(() => [...document.querySelectorAll('.menu-popup .mi .lbl')].map((l) => l.textContent));
  const open = async (path) => {
    await page.eval((p) => window.SilinxApp.openFile(p), path);
    await page.waitFor((p) => window.Silinx.active?.id === `file:${p}` && window.Silinx.active.editor, [path]);
  };
  await open('src/f.c');
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Templates ▾' });
  await page.waitForSelector('.menu-popup');
  const C = ['includes', 'top function (ports)', 'test bench (main)', 'ap_uint / ap_int', 'bits and ranges', 'ap_fixed', 'for loop (PIPELINE)', 'for loop (UNROLL)',
    'loop of a variable count (LOOP_TRIPCOUNT)', 'array argument (ap_memory)', 'ROM (a constant table)', 'static register (counter)', 'struct argument'];
  assert.deepEqual(await items(), C);
  // inserted where the cursor is (line 2), indented as the line it goes into
  await page.eval(() => window.Silinx.active.editor.setCursor({ line: 1, ch: 0 }));
  await page.click('.menu-popup .mi', { text: 'for loop (PIPELINE)' });
  assert.match(await page.eval(() => window.Silinx.active.editor.getValue()), /^int f\(int a\) \{\nfor \(int i = 0; i < 8; i\+\+\) \{\n\s*#pragma HLS PIPELINE II=1\n[\s\S]*\}\s*return a;\n\}\n$/);
  await open('src/g.cpp');
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Templates ▾' });
  await page.waitForSelector('.menu-popup');
  assert.deepEqual(await items(), [...C, 'hls::stream (read, write)', 'DATAFLOW (two processes, a stream)', 'hls::task (data-driven)']);
  await page.closeMenus();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Modelos ▾' });
  await page.waitForSelector('.menu-popup');
  const pt = await items();
  for (const l of ['função de topo (portas)', 'ciclo for (PIPELINE)', 'registo static (contador)', 'hls::task (guiado pelos dados)']) assert.ok(pt.includes(l), l);
  await page.closeMenus();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});

// #1897: a test bench reading its inputs from the project's files and comparing its results with a golden one; its top
// function writing a trace file only in the C simulation (#ifndef __SYNTHESIS__)
const TRACE = `#include <stdio.h>
int twice(int a) {
#ifndef __SYNTHESIS__
  FILE *fp = fopen("trace.dat", "a");
  fprintf(fp, "%d\\n", a);
  fclose(fp);
#endif
  return 2 * a;
}
int main(void) {
  int x, n = 0;
  FILE *in = fopen("tb_data/in.dat", "r");
  FILE *out = fopen("out.dat", "w");
  while (fscanf(in, "%d", &x) == 1) { fprintf(out, "%d\\n", twice(x)); n++; }
  fclose(in);
  fclose(out);
  int bad = system("diff -w out.dat tb_data/golden.dat");
  printf("%d values, %s\\n", n, bad ? "Mismatch" : "Results are good");
  return bad;
}
`;

uiTest('#1897 C Simulation of a test bench with files: the project\'s data files read, its golden file compared (diff), the files it wrote said (in memory); C/RTL Co-simulation PASS', E, async (page) => {
  await makeProject(env, { name: 'CFiles', top: '', files: { 'src/twice.c': TRACE, 'src/tb_data/in.dat': '3\n-4\n10\n', 'src/tb_data/golden.dat': '6\n-8\n20\n' } });
  await page.openProject('CFiles');
  await page.showMessages();
  await page.eval(() => window.SilinxApp.openFile('src/twice.c'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/twice.c' && window.Silinx.active.editor);
  const btn = (t) => page.click('.doc:not([hidden]) .editor-bar .btn', { text: t });
  await btn('C Simulation');
  await page.waitConsole(/Process "C Simulation" completed successfully/);
  const log = await page.consoleText();
  assert.match(log, /\n3 values, Results are good\n2 file\(s\) written by the test bench, in memory \(not saved to the project\): out\.dat, trace\.dat\nmain\(\) returned 0; 3 call\(s\) of 'twice'\./);
  assert.doesNotMatch(log, /ERROR:SilinxC|WARNING:SilinxC/);
  await btn('C/RTL Co-simulation');
  await page.waitConsole(/Process "C\/RTL Co-simulation" completed successfully/, { timeout: 60000 });
  assert.match(await page.consoleText(), /C\/RTL co-simulation PASS: 3 call\(s\), the same results/);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

// #1924: a function's HDL scheduled for the board's clock (Basys2: 50 MHz, 20 ns) with its family's delays (a Spartan-3E,
// #2080: an addition 4.06 ns): three additions in a row fit it, a combinational module; four do not, a sequential one
// (at Vitis HLS's 10 ns on an Artix-7, three fit); the report says the clock
uiTest('#1924 View C Synthesis Report: the target clock the board\'s (20 ns), the Spartan-3E\'s delays: three additions combinational there, four sequential', E, async (page) => {
  await makeProject(env, { name: 'CClock', top: 'sum4', files: { 'src/sum4.c': 'int sum4(int a, int b, int c, int d, int e) {\n  return a + b + c + d + e;\n}\n', 'src/sum3.c': 'int sum3(int a, int b, int c, int d) {\n  return a + b + c + d;\n}\n' } });
  await page.openProject('CClock');
  await page.showMessages();
  for (const [top, module] of [['sum3', 'combinational'], ['sum4', 'sequential, ap_ctrl_hs \\(ap_clk, ap_rst, ap_start \\/ ap_done \\/ ap_idle \\/ ap_ready\\), 4 states, \\d+ register bits']]) {
    await page.treeRow('#hier', top);
    await page.treeRow('#procs', 'View C Synthesis Report', { dbl: true, exact: true });
    await page.waitConsole(new RegExp(`C Synthesis Report of '${top}'[\\s\\S]*Process "View C Synthesis Report" completed successfully`));
    const log = await page.consoleText();
    assert.match(log, new RegExp(`C Synthesis Report of '${top}' \\(src\\/${top}\\.c, VHDL\\)\\n\\nModule: ${module}\\nTarget clock: 20 ns \\(the board's oscillator\\)\\n`));
    assert.doesNotMatch(log, /WARNING|ERROR/);
  }
});

// #2080: a pipelined loop that does not fit the board's clock: its II kept, said in the report, not in a compilation's messages
uiTest('#2080 View C Synthesis Report: a pipelined loop too slow for the board\'s clock said, with its path; one that fits, not', E, async (page) => {
  const loop = (name, prag) => `int ${name}(int x) {\n  int s = 0;\n  for (int i = 0; i < 100; i++) {\n#pragma HLS PIPELINE ${prag}\n    s += x * i + x + i + 1;\n  }\n  return s;\n}\n`;
  await makeProject(env, { name: 'CSlow', top: 'slow', files: { 'src/slow.c': loop('slow', 'II=1'), 'src/calm.c': loop('calm', 'off') } });
  await page.openProject('CSlow');
  await page.showMessages();
  await page.treeRow('#hier', 'calm');
  await page.treeRow('#procs', 'View C Synthesis Report', { dbl: true, exact: true });
  await page.waitConsole(/C Synthesis Report of 'calm'[\s\S]*Process "View C Synthesis Report" completed successfully/);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
  await page.treeRow('#hier', 'slow');
  await page.treeRow('#procs', 'View C Synthesis Report', { dbl: true, exact: true });
  await page.waitConsole(/C Synthesis Report of 'slow'[\s\S]*Process "View C Synthesis Report" completed successfully/);
  const log = await page.consoleText();
  assert.match(log, /line 3 +100 iterations; II=1, 101 cycles; pipelined, II=1 asked/);
  assert.match(log, /WARNING:SilinxC - "src\/slow\.c" line 3: this pipelined loop's iteration does not fit the 20 ns clock: a path of about \d+\.\d ns in one cycle \(Silinx adds no pipeline stages\); a slower clock, or #pragma HLS PIPELINE off, makes it fit/);
  assert.doesNotMatch(log, /ERROR/);
});

// The lines a viewer sees, not those hidden by the Console's filter: the test designs of each language.
const shownLines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => l.getClientRects().length > 0).map((l) => l.textContent));
const pressedFilter = (page) => page.eval(() => [...document.querySelectorAll('#mc-filters .filt[aria-pressed="true"]')].map((b) => b.dataset.src));
const NO_WARNINGS = (lines) => assert.deepEqual(lines.filter((l) => /WARNING|ERROR/.test(l)), []);

for (const [mod, file, output, latency] of [['gcd', 'src/gcd.c', 'gcd(48, 18) = 6', /^Latency: 2 to 12 cycles \(average 6\.8\)\.$/], ['stream_sum', 'src/stream_sum.cpp', 'sum[7] = 321', /^Latency: 17 to 17 cycles \(average 17\.0\)\.$/]]) {
  uiTest(`#2262 ${file} in its editor, nothing shown first: C Simulation, C/RTL Co-simulation and View C Synthesis Report show their lines; no warnings`, E, async (page) => {
    const name = `CShown${mod}`;
    await makeProject(env, { name, top: mod, files: { [file]: readFileSync(new URL(`../../test-designs/${mod}/${file}`, import.meta.url), 'utf8') } });
    await page.openProject(name);
    await page.eval((f) => window.SilinxApp.openFile(f), file);
    await page.waitFor((f) => window.Silinx.active?.id === `file:${f}` && window.Silinx.active.editor, [file]);
    const tasks = await page.eval(() => document.documentElement.dataset.layout === 'tasks');
    const btn = (t) => page.click('.doc:not([hidden]) .editor-bar .btn', { text: t });
    await btn('C Simulation');
    await page.waitConsole(/Process "C Simulation" completed successfully/);
    await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /Process "C Simulation" completed/.test(l.textContent) && l.dataset.src), [], { what: 'the lines tagged' });
    let shown = await shownLines(page);
    assert.ok(shown.includes(output), 'the program\'s output shown');
    assert.ok(shown.includes('Process "C Simulation" completed successfully'));
    assert.deepEqual(await pressedFilter(page), [tasks ? 'sim' : 'all']);
    NO_WARNINGS(shown);
    await btn('C/RTL Co-simulation');
    await page.waitConsole(/Process "C\/RTL Co-simulation" completed successfully/, { timeout: 60000 });
    await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /Process "C\/RTL Co-simulation" completed/.test(l.textContent) && l.dataset.src), [], { what: 'the lines tagged' });
    shown = await shownLines(page);
    assert.ok(shown.some((l) => latency.test(l)), 'the latency shown');
    assert.ok(shown.some((l) => /^C\/RTL co-simulation PASS: \d+ call\(s\), the same results$/.test(l)), 'PASS shown');
    NO_WARNINGS(shown);
    // (Implementation's lines, as a synthesis's)
    await page.leftTab('design');
    await page.treeRow('#hier', mod);
    await page.treeRow('#procs', 'View C Synthesis Report', { dbl: true, exact: true });
    await page.waitConsole(/Process "View C Synthesis Report" completed successfully/);
    await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /Process "View C Synthesis Report" completed/.test(l.textContent) && l.dataset.src), [], { what: 'the lines tagged' });
    shown = await shownLines(page);
    assert.ok(shown.includes('Process "View C Synthesis Report" completed successfully'));
    assert.deepEqual(await pressedFilter(page), [tasks ? 'impl' : 'all']);
    NO_WARNINGS(shown);
    assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  });
}
