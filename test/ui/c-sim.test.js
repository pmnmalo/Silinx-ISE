// UI (#1528): the C editor's C Simulation (main() run: its output in the Console) and C/RTL Co-simulation (main()'s
// calls of the top function replayed on its HDL: PASS, the latency of a sequential one; a failing C simulation said);
// the buttons in Portuguese; both interfaces. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
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
    if (i < n) s += a[i];
  }
  return s;
}
int main(void) {
  int t[8] = {3, -1, 4, 1, -5, 9, 2, 6};
  printf("%d %d\\n", sum(t, 3), sum(t, 8));
  return 0;
}
`;

uiTest('#1531 a C module\'s processes (C Synthesis (HLS)): View C Synthesis Report (the module, its ports, its memories, each loop\'s II), C Simulation and C/RTL Co-simulation, in both views; Portuguese', E, async (page) => {
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
  assert.match(log, /Loops:\n {2}line 4 {4}8 iterations; II=5, 41 cycles; pipelined, II=1 asked\n/);
  assert.match(log, /WARNING:SilinxC - "src\/sum\.c" line 4: #pragma HLS PIPELINE II=1: II=5 made \(it accesses a memory, an access a state\)/);
  await page.treeRow('#procs', 'C Simulation', { dbl: true, exact: true });
  await page.waitConsole(/Process "C Simulation" completed successfully/);
  assert.match(await page.consoleText(), /\n6 19\nmain\(\) returned 0; 2 call\(s\) of 'sum'\./);
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
