// Silinx HLS, a test bench's files in the C simulation (#1897): the code only the C simulation compiles
// (#ifndef __SYNTHESIS__, as Vitis HLS's synthesis defines __SYNTHESIS__) checked as the test bench's, even inside the
// top function; FILE * with fopen / fprintf / fscanf / fclose, sprintf's names, system("diff …") over the project's
// files in memory, nothing outside them; FILE refused in the synthesized code with a clear message. Each program
// against cc (its output, its exit code, the files it writes) and its HDL compiled, elaborated and simulated in VHDL
// and in Verilog (the co-simulation, and against the C on random inputs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { checkC } from '../core/c-check.js';
import { testBenchFiles } from '../core/c-interp-lib.js';
import { CC, CC_WARN, noCC, lf, against, compiledRun } from './c-helpers.js';

// the top function writes a trace file of each call, only in the C simulation (as AMD's hier_func example)
const TOP = `#include <stdio.h>
void sumsub(int a, int b, int *c, int *d) {
  int apb = a + b, amb = a - b;
#ifndef __SYNTHESIS__
  FILE *fp1;
  char filename[32];
  sprintf(filename, "trace_%03d.dat", apb & 255);
  fp1 = fopen(filename, "w");
  fprintf(fp1, "%d \\n", apb);
  fclose(fp1);
#endif
  *c = apb >> 1;
  *d = amb >> 2;
}
`;
// its test bench: the inputs read from a file of the project, the results written to a file and compared with a golden one
const TB = `#include <stdlib.h>
${TOP}
int main() {
  int a[4], c, d, tmp, retval = 0;
  FILE *fp = fopen("tb_data/in.dat", "r");
  if (fp == NULL) return 9;
  for (int i = 0; i < 4; i++) { fscanf(fp, "%d", &tmp); a[i] = tmp; }
  fclose(fp);
  fp = fopen("out.dat", "w");
  for (int i = 0; i < 3; i++) { sumsub(a[i], a[i + 1], &c, &d); fprintf(fp, "%d %d\\n", c, d); }
  fclose(fp);
  retval = system("diff --brief -w out.dat tb_data/out.golden.dat") != 0;   // (system's value a wait status: 256 for diff's 1)
  printf(retval ? "Mismatch\\n" : "Results are good\\n");
  return retval;
}
`;
const IN = '6457\n5638\n-19150\n42\n';
const GOLDEN = '6047 204\n-6756 6197\n-9554 -4798\n';

/** The program's output, exit code and written files, compiled with cc and run in a folder with the files given. */
function compiled(src, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-tbf-'));
  try {
    for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); }
    fs.writeFileSync(path.join(dir, 't.c'), src);
    execFileSync(CC, ['-std=c99', ...CC_WARN, '-o', path.join(dir, 't'), path.join(dir, 't.c')], { stdio: ['ignore', 'ignore', 'pipe'] });
    let r;
    try { r = { output: lf(execFileSync(path.join(dir, 't'), { cwd: dir, encoding: 'utf8' })), exitCode: 0 }; } catch (e) { r = { output: lf(e.stdout), exitCode: e.status }; }
    r.files = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.dat')).map((f) => [f, lf(fs.readFileSync(path.join(dir, f), 'utf8'))]));
    return r;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('#1897 a FILE in the top function under #ifndef __SYNTHESIS__ (AMD\'s hier_func): the C simulation runs it against cc (the trace files, sprintf\'s names, fscanf of the project\'s file, diff with the golden one); no message', { skip: noCC }, () => {
  const files = { 'tb_data/in.dat': IN, 'tb_data/out.golden.dat': GOLDEN };
  const ref = compiled(TB, files);
  // (the project's files: the source's folder's, the test bench naming them from there)
  const sim = simulateC(TB, { file: 'src/hier.c', files: { 'src/tb_data/in.dat': IN, 'src/tb_data/out.golden.dat': GOLDEN } });
  assert.deepEqual([sim.ok, sim.error, sim.diagnostics], [true, null, []]);
  assert.deepEqual([sim.output, sim.exitCode], [ref.output, ref.exitCode]);
  assert.deepEqual([sim.output, sim.exitCode], ['Results are good\n', 0]);
  assert.deepEqual(sim.files, ref.files);
  assert.deepEqual(Object.keys(sim.files).sort(), ['out.dat', 'trace_056.dat', 'trace_063.dat', 'trace_092.dat']);
  assert.equal(sim.calls.length, 3);
  // the same test bench as C++ (#1590's tokens): the same run
  const cpp = simulateC(TB, { file: 'src/hier.cpp', files: { 'src/tb_data/in.dat': IN, 'src/tb_data/out.golden.dat': GOLDEN } });
  assert.deepEqual([cpp.error, cpp.diagnostics, cpp.output, cpp.exitCode, cpp.files], [null, [], sim.output, 0, sim.files]);
  // a golden file that differs: the test bench fails, as compiled
  const bad = simulateC(TB, { file: 'src/hier.c', files: { 'src/tb_data/in.dat': IN, 'src/tb_data/out.golden.dat': GOLDEN.replace('204', '205') } });
  const badRef = compiled(TB, { ...files, 'tb_data/out.golden.dat': GOLDEN.replace('204', '205') });
  assert.deepEqual([bad.output, bad.exitCode], [badRef.output, badRef.exitCode]);
  assert.equal(bad.exitCode, 1);
  assert.equal(bad.output, 'Files out.dat and tb_data/out.golden.dat differ\nMismatch\n');
});

test('#1936 the reference compiler refuses a library function called without its header, on Linux as clang on macOS (the test bench\'s system() needs <stdlib.h>); with it, compiled', { skip: noCC }, () => {
  const undeclared = /implicit declaration of function .system.|call to undeclared function .system./;   // (GCC quotes it ‘system’ in a UTF-8 locale)
  const prog = (inc) => `${inc}int main(void) { return system("exit 3") != 0 ? 0 : 1; }\n`;
  assert.throws(() => compiled(prog(''), {}), undeclared);
  assert.throws(() => compiledRun(prog('')), undeclared);
  assert.deepEqual(compiled(prog('#include <stdlib.h>\n'), {}), { output: '', exitCode: 0, files: {} });
  assert.deepEqual(compiledRun(prog('#include <stdlib.h>\n')), { output: '', exitCode: 0 });
});

test('#1897 the synthesis defines __SYNTHESIS__: the trace code is not synthesized (no message), the HDL compiled, elaborated and simulated in VHDL and Verilog: the co-simulation passes, the outputs the C\'s on random inputs', { skip: noCC }, () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = cToHdl(TB, { file: 'hier.c', lang });
    assert.deepEqual([g.ok, g.top, g.diagnostics], [true, 'sumsub', []], lang);
    assert.doesNotMatch(g.hdl, /trace|fopen/);
    const c = cosimulate(TB, { file: 'hier.c', lang, files: { 'tb_data/in.dat': IN, 'tb_data/out.golden.dat': GOLDEN } });
    assert.deepEqual([c.errors, c.ok, c.pass, c.calls, c.mismatches], [[], true, true, 3, []], lang);
  }
  // (the compiled C writes its trace files where it runs: a folder of its own)
  const cwd = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-tbf-'));
  try {
    process.chdir(dir);
    against(TOP, 'sumsub', { ins: [{ name: 'a', w: 32, s: true }, { name: 'b', w: 32, s: true }], outs: [{ name: 'c', w: 32, s: true }, { name: 'd', w: 32, s: true }], n: 20 });
  } finally { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('#1897 #ifndef / #else on __SYNTHESIS__: the C simulation the first branch, the synthesis the other (its HDL simulated in VHDL and Verilog); #if !defined(…) and #ifdef the same', () => {
  for (const [open, mid] of [['#ifndef __SYNTHESIS__', '#else'], ['#if !defined(__SYNTHESIS__)', '#else'], ['#ifdef __SYNTHESIS__', null]]) {
    const sim1 = mid ? 'r = 1;' : 'r = 2;', syn1 = mid ? 'r = 2;' : 'r = 1;';
    const src = `int pick(int a) {\n  int r;\n${open}\n  ${sim1}\n${mid || '#else'}\n  ${syn1}\n#endif\n  return r + a;\n}\nint main() { return pick(0); }\n`;
    const sim = simulateC(src, { file: 'p.c' });
    assert.deepEqual([sim.diagnostics, sim.exitCode], [[], 1], open);
    for (const lang of ['vhdl', 'verilog']) {
      const g = cToHdl(src, { file: 'p.c', lang });
      assert.deepEqual(g.diagnostics, [], `${open} ${lang}`);
      const c = cosimulate(src, { file: 'p.c', lang });
      // (the HDL gives 2, the C simulation 1: the two views differ, as Vitis HLS's would)
      assert.deepEqual([c.ok, c.pass, c.mismatches.map((m) => [m.port, String(m.expected), String(m.got)])], [true, false, [['ap_return', '1', '2']]], `${open} ${lang}`);
    }
  }
});

test('#1897 FILE in the synthesized code without __SYNTHESIS__: refused with a clear message, in the C simulation and the synthesis; in the test bench allowed', () => {
  const src = '#include <stdio.h>\nint f(int a) {\n  FILE *fp = fopen("t.dat", "w");\n  fprintf(fp, "%d\\n", a);\n  fclose(fp);\n  return a;\n}\nint main() { return f(0); }\n';
  const msgs = (ds) => ds.map((d) => `${d.line}: ${d.severity}: ${d.message}`);
  const expected = [
    "3: error: 'fp': a FILE (stdio.h's files) is the test bench's, not possible in the synthesized code (Silinx HLS, as Vitis HLS; the C simulation's code only: #ifndef __SYNTHESIS__)",
    '3: error: fopen is a system call: not possible in the synthesized code (Silinx HLS, as Vitis HLS)',
    '4: warning: fprintf is ignored by synthesis (it only prints in C simulation)',
    '5: error: fclose is a system call: not possible in the synthesized code (Silinx HLS, as Vitis HLS)',
  ];
  assert.deepEqual(msgs(checkC(src, 'f.c').diagnostics), expected);
  assert.deepEqual(msgs(cToHdl(src, { file: 'f.c' }).diagnostics), expected);
  const sim = simulateC(src, { file: 'f.c' });
  assert.deepEqual([sim.ok, msgs(sim.diagnostics)], [false, expected]);
  // the same in main(): the test bench's
  const tb = '#include <stdio.h>\nint f(int a) { return a; }\nint main() {\n  FILE *fp = fopen("t.dat", "w");\n  fprintf(fp, "%d\\n", f(7));\n  fclose(fp);\n  return 0;\n}\n';
  const ok = simulateC(tb, { file: 'f.c' });
  assert.deepEqual([ok.diagnostics, ok.exitCode, ok.files], [[], 0, { 't.dat': '7\n' }]);
});

test('#1897 sprintf / snprintf into a char array, %s of a char array, a name made for fopen: against cc; a write outside the array said', { skip: noCC }, () => {
  const src = `#include <stdio.h>
int f(int a) { return a + 1; }
int main() {
  char s[16], t[8];
  int n = sprintf(s, "v%+04d|%x", f(-6), 255);
  int m = snprintf(t, sizeof t, "%s-%s", s, "abc");
  printf("[%s] %d [%s] %d [%.3s]\\n", s, n, t, m, s);
  sprintf(s, "f_%02d.dat", f(2));
  FILE *fp = fopen(s, "w");
  fprintf(fp, "%s\\n", t);
  fclose(fp);
  fp = fopen(s, "r");
  char back[8];
  fscanf(fp, "%s", back);
  fclose(fp);
  puts(back);
  return 0;
}
`;
  const ref = compiled(src, {});
  const sim = simulateC(src, { file: 's.c' });
  assert.deepEqual([sim.error, sim.diagnostics.map((d) => d.message)], [null, []]);
  assert.deepEqual([sim.output, sim.exitCode, sim.files], [ref.output, ref.exitCode, ref.files]);
  assert.equal(sim.output, '[v-005|ff] 8 [v-005|f] 12 [v-0]\nv-005|f\n');
  const over = simulateC('#include <stdio.h>\nint f(int a) { return a; }\nint main() {\n  char s[4];\n  sprintf(s, "%d", f(12345));\n  return 0;\n}\n', { file: 'o.c' });
  assert.deepEqual([over.ok, over.error], [false, { line: 5, col: 3, message: 'sprintf: 6 chars written into an array of 4 (outside the array)' }]);
  // in the synthesized code: the test bench's only
  assert.deepEqual(checkC('#include <stdio.h>\nint f(int a) {\n  char s[4];\n  sprintf(s, "%d", a);\n  return a;\n}\n', 'h.c').diagnostics.map((d) => d.message),
    ['sprintf() runs in the C simulation only (the test bench), not in the synthesized code']);
});

test('#1897 a test bench reaches only the project\'s files: a path out of it (absolute, through \'..\', a drive, ~) refused with a message, even when the project has a file of that name, in fopen and diff; a file the project has not: NULL; system() only diff', () => {
  const host = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-host-'));
  try {
    fs.writeFileSync(path.join(host, 'secret.dat'), 'host\n');
    const abs = path.join(host, 'secret.dat').replace(/\\/g, '/');
    const files = { 'src/in.dat': 'mine\n', 'src/secret.dat': 'project\n' };
    const run = (call) => simulateC(`#include <stdio.h>\n#include <stdlib.h>\nint f(int a) { return a; }\nint main() {\n  ${call};\n  return f(0);\n}\n`, { file: 'src/t.c', files });
    const refused = (name, what = 'fopen') => `${what}: '${name}' is outside the project (a test bench opens only the project's files: a path inside it, without '..')`;
    for (const name of [abs, '../../in.dat', 'tb/../../in.dat', '..\\in.dat', 'C:\\data\\in.dat', '\\\\host\\share\\in.dat', '~/in.dat']) {
      const r = run(`FILE *fp = fopen(${JSON.stringify(name)}, "r")`);
      assert.deepEqual([r.ok, r.error], [false, { line: 5, col: 14, message: refused(name) }], name);
    }
    // (written too: never outside the project)
    assert.equal(run('FILE *fp = fopen("../out.dat", "w")').error.message, refused('../out.dat'));
    const d = run('system("diff -w in.dat ../../etc/passwd")');
    assert.equal(d.error.message, refused('../../etc/passwd', 'system("diff -w in.dat ../../etc/passwd")'));
    // a path inside the project: its file; one the project has not: NULL, as C's fopen of a missing file
    const ok = run('char s[8] = "none"; FILE *a = fopen("./in.dat", "r"); fscanf(a, "%s", s); FILE *b = fopen("tb/none.dat", "r"); printf("%s %d\\n", s, b == NULL)');
    assert.deepEqual([ok.error, ok.output, ok.exitCode], [null, 'mine 1\n', 0]);
  } finally { fs.rmSync(host, { recursive: true, force: true }); }
  // system(): only diff, any other command refused
  const sys = simulateC('#include <stdlib.h>\nint f(int a) { return a; }\nint main() { return system("cat /etc/passwd") + f(0); }\n', { file: 'y.c' });
  assert.equal(sys.error.message, 'system("cat /etc/passwd") cannot be run in Silinx\'s C simulation (only diff)');
});

test('#1897 the browser edition\'s files: the C simulation and the co-simulation run the test bench\'s files with no file system (node:fs\'s functions throwing, as in a browser), their modules importing no Node API', async () => {
  // the modules the C simulation loads: none imports a Node built-in (they run in the browser as they are)
  const seen = new Set(), todo = [new URL('../core/c-interp.js', import.meta.url), new URL('../core/c-cosim.js', import.meta.url)];
  while (todo.length) {
    const u = todo.pop();
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    const text = fs.readFileSync(u, 'utf8');
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1] || m[2];
      assert.ok(spec.startsWith('.'), `${u.pathname.split('/').slice(-2).join('/')} imports '${spec}' (not a module of the project)`);
      todo.push(new URL(spec, u));
    }
  }
  assert.ok(seen.size > 10);
  // every file function of node:fs throwing during the run: the files are the in-memory map's only
  const { syncBuiltinESMExports } = await import('node:module');
  const saved = {};
  for (const k of Object.keys(fs)) if (typeof fs[k] === 'function' && /^(read|open|stat|lstat|exists|access|write|append|readdir|createRead|createWrite|watch)/.test(k)) { saved[k] = fs[k]; fs[k] = () => { throw new Error(`fs.${k} called`); }; }
  for (const k of Object.keys(fs.promises)) if (typeof fs.promises[k] === 'function') { saved[`p.${k}`] = fs.promises[k]; fs.promises[k] = () => { throw new Error(`fs.promises.${k} called`); }; }
  syncBuiltinESMExports();
  let sim, co;
  try {
    const files = { 'src/tb_data/in.dat': IN, 'src/tb_data/out.golden.dat': GOLDEN };
    sim = simulateC(TB, { file: 'src/hier.c', files });
    co = cosimulate(TB, { file: 'src/hier.c', lang: 'verilog', files });
  } finally {
    for (const [k, f] of Object.entries(saved)) { if (k.startsWith('p.')) fs.promises[k.slice(2)] = f; else fs[k] = f; }
    syncBuiltinESMExports();
  }
  assert.deepEqual([sim.error, sim.diagnostics, sim.output, sim.exitCode], [null, [], 'Results are good\n', 0]);
  assert.deepEqual(Object.keys(sim.files).sort(), ['out.dat', 'trace_056.dat', 'trace_063.dat', 'trace_092.dat']);
  assert.equal(sim.files['out.dat'], GOLDEN);
  assert.deepEqual([co.errors, co.pass, co.calls], [[], true, 3]);
});

test('#1897 the project\'s files the app reads for a test bench: those its strings name with their extensions (a format\'s conversions any text, diff\'s names), not the build\'s', () => {
  const src = 'fopen("tb_data/inA.dat", "r"); sprintf(f, "Out_apb_%03d.dat", x); printf("%d\\n", 1); printf("%s", s); system("diff -w out.dat out.golden.dat");';
  const paths = ['src/a.c', 'src/tb_data/inA.dat', 'src/tb_data/inB.dat', 'Out_apb_007.dat', 'Out_apb_x.txt', 'build/out.dat', 'out.dat', 'src/out.golden.dat', 'x.txt', 'project.json'];
  assert.deepEqual(testBenchFiles(src, paths), ['src/tb_data/inA.dat', 'Out_apb_007.dat', 'out.dat', 'src/out.golden.dat']);
  assert.deepEqual(testBenchFiles('int main() { printf("%d", 1); return 0; }', paths), []);
});
