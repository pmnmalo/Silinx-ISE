// Silinx HLS: #pragma HLS INTERFACE m_axi (#1893), Vitis HLS's AXI4 master: a pointer or an array argument a memory read
// and written over the bus, its address a register of the AXI4-Lite slave (offset=slave), a port (offset=direct) or 0
// (offset=off); the module waiting (ap_ce) while an access is not done. Each design co-simulated through a model of the
// buses in VHDL and in Verilog, its warnings asserted; the corpus designs' ports as Vitis HLS 2025.2's (vitis.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { addDirectives } from '../core/c-pragma.js';
import { busWidth, wordBytes, masterPorts } from '../core/c-axi-master.js';
import { comparePorts } from '../scripts/hls-vitis.mjs';
import { sourceDir } from '../scripts/fetch-design-corpus.mjs';
import { unitOf } from './hls-corpus/lib.mjs';

const LANGS = ['vhdl', 'verilog'];
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const msgs = (gen) => gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const AUTO = (line, ii) => `${line} warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=${ii} made (it accesses a memory, an access a state); #pragma HLS PIPELINE off in it turns that off`;

function cosim(src, warnings, top, opts = {}) {
  for (const lang of LANGS) {
    const r = cosimulate(src, { file: 'a.cpp', lang, top, ...opts });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.deepEqual(msgs(r.gen), warnings, lang);
  }
  return cToHdl(src, { file: 'a.cpp', top, ...opts });
}

test('#1893 the bus: 32 bits at least, a word rounded up to a power of 2 bytes, max_widen_bitwidth= if more; its ports', () => {
  assert.deepEqual([busWidth([8]), busWidth([32, 8]), busWidth([33]), busWidth([192]), busWidth([32], 256), busWidth([512], 64)], [32, 32, 64, 256, 256, 512]);
  assert.deepEqual([1, 8, 9, 32, 33, 192].map(wordBytes), [1, 1, 2, 4, 8, 32]);
  const ps = masterPorts('gmem', 64);
  assert.equal(ps.length, 45);
  assert.deepEqual(['AWADDR', 'WDATA', 'WSTRB', 'ARLEN', 'RDATA', 'BRESP'].map((n) => ps.find((p) => p.name === `m_axi_gmem_${n}`)).map((p) => `${p.dir} ${p.w}`), ['out 64', 'out 64', 'out 8', 'out 8', 'in 64', 'in 2']);
});

const TWO = `void f(char *a, int *b, int n) {
#pragma HLS INTERFACE m_axi port=a depth=8 bundle=gmem
#pragma HLS INTERFACE m_axi port=b depth=8 bundle=gmem
#pragma HLS INTERFACE s_axilite port=return
  for (int i = 0; i < n; i++) { b[i] = a[i] + b[n - 1 - i]; a[i] = (char)i; }
}
int main() {
  char a[8] = { 1, 2, 3, 4, 5, 6, 7, 8 }; int b[8] = { 10, 20, 30, 40, 50, 60, 70, 80 };
  f(a, b, 8); f(a, b, 5);
  return b[0] == 41 ? 0 : 1;
}
`;

test('#1893 two masters on one bundle, a byte on its lane: read and written, their addresses registers of 64 bits', () => {
  const g = cosim(TWO, ['5 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)', AUTO(5, 3)], 'f');
  assert.deepEqual(g.axi.lite[0].regs.map((r) => [r.port, r.off, r.words]), [['a_base', 0x10, 2], ['b_base', 0x1c, 2]]);
  assert.equal(g.axi.lite[0].aw, 6);
  assert.deepEqual(g.axi.buses.map((b) => [b.bundle, b.w, b.clients.map((c) => `${c.name} ${c.bytes}`)]), [['gmem', 32, ['a 1', 'b 4']]]);
  assert.ok(!g.ports.some((p) => /^(a|b)_|ap_ce/.test(p.name)));
  assert.ok(/ap_ce/.test(g.hdl));
});

test('#1893 a wrong byte lane is found through the bus', () => {
  const r = cosimulate(TWO, { file: 'a.cpp', top: 'f', lang: 'verilog', alter: (h) => h.replace(/assign (m_axi_gmem_WSTRB) = (\w+);/, "assign $1 = 4'hf;") });
  assert.equal(r.pass, false);
  assert.ok(r.mismatches.some((m) => m.port === 'AXI'));
});

test('#1893 offset=direct a port of 64 bits, offset=off none; no s_axilite: control made for a slave address, the block protocol ports', () => {
  const g = cosim(`int f(int *p, int *q, int *r) {
#pragma HLS INTERFACE m_axi port=p depth=4 offset=direct bundle=g0
#pragma HLS INTERFACE m_axi port=q depth=4 bundle=g1
#pragma HLS INTERFACE m_axi port=r depth=4 offset=off bundle=g1
  int s = 0;
  for (int i = 0; i < 4; i++) s += p[i] * q[i] + r[i];
  return s;
}
int main() { int p[4] = { 1, 2, 3, 4 }, q[4] = { 5, 6, 7, 8 }, r[4] = { 0, 0, 0, 0 }; return f(p, q, r) == 70 ? 0 : 1; }
`, [AUTO(6, 3)], 'f');
  const names = g.ports.map((p) => p.name).filter((n) => !/^[ms]_axi_/.test(n));
  assert.deepEqual(names, ['ap_clk', 'ap_rst_n', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'ap_return', 'p']);
  assert.equal(g.ports.find((x) => x.name === 'p').w, 64);
  assert.deepEqual(g.axi.lite.map((m) => [m.bundle, m.regs.map((r) => r.port)]), [['control', ['q_base']]]);
});

test('#1893 a pointer to one value (*p) with m_axi: a memory of its depth', () => {
  cosim(`void f(int *d) {
#pragma HLS INTERFACE m_axi port=d depth=1
  *d = *d * 3 + 1;
}
int main() { int d = 4; f(&d); f(&d); return d == 40 ? 0 : 1; }
`, [], 'f');
});

test("#1893 the config's interface directive (syn.directive.interface): a pragma of the top; another function's or mode not", () => {
  const fn = { name: 'f', loc: { line: 3 }, body: { items: [] } };
  addDirectives(fn, ['interface f mode=m_axi depth=5 d', 'interface g mode=m_axi depth=1 x', 'interface f d_i depth=4 mode=ap_fifo', 'interface f mode=ap_ctrl_hs return']);
  // (ap_fifo too, #1901)
  assert.deepEqual(fn.body.items.map((s) => s.pragma.args), [{ mode: 'ap_fifo', depth: '4', port: 'd_i' }, { mode: 'm_axi', depth: '5', port: 'd' }]);
  cosim(`void f(int *d) {
  for (int i = 0; i < 2; i++) d[i] += 1;
}
int main() { int d[2] = { 1, 2 }; f(d); return d[1] == 3 ? 0 : 1; }
`, [AUTO(2, 2)], 'f', { directives: ['interface f mode=m_axi depth=2 d'] });
});

test('#1893 DATAFLOW: the processes wait together for the bus', () => {
  const g = cosim(`#include <hls_stream.h>
void load(int *in, hls::stream<int> &s) { for (int i = 0; i < 4; i++) s.write(in[i]); }
void store(hls::stream<int> &s, int *out) { for (int i = 0; i < 4; i++) out[i] = s.read() + 1; }
void f(int *in, int *out) {
#pragma HLS INTERFACE m_axi port=in depth=4 bundle=gmem0
#pragma HLS INTERFACE m_axi port=out depth=4 bundle=gmem1
#pragma HLS DATAFLOW
  hls::stream<int, 2> s;
  load(in, s);
  store(s, out);
}
int main() { int a[4] = { 1, 2, 3, 4 }, b[4]; f(a, b); return b[3] == 5 ? 0 : 1; }
`, [], 'f');
  assert.deepEqual(g.axi.buses.map((b) => b.bundle), ['gmem0', 'gmem1']);
});

// ------------------------------------------------------------------ the corpus (when fetched: npm run test:hls)
const manifest = JSON.parse(fs.readFileSync(new URL('./hls-corpus/manifest.json', import.meta.url), 'utf8'));
const vitis = JSON.parse(fs.readFileSync(new URL('./hls-corpus/vitis.json', import.meta.url), 'utf8'));
const corpusDir = sourceDir(manifest.sources['vitis-hls-examples']);
const fetched = fs.existsSync(corpusDir) ? false : 'the HLS corpus is not fetched (npm run test:hls fetches it)';

// (each design: its warnings, Silinx's own; its ports Vitis HLS's)
const CORPUS = JSON.parse(fs.readFileSync(new URL('./c-axi-master.corpus.json', import.meta.url), 'utf8'));

test('#1893 the corpus designs with m_axi and s_axilite: the ports of Vitis HLS 2025.2, co-simulated in VHDL and Verilog', { skip: fetched }, () => {
  for (const [name, warnings] of Object.entries(CORPUS)) {
    const d = manifest.designs.find((x) => x.name === name);
    const texts = Object.fromEntries([...d.files, ...d.tb, ...d.headers].map((f) => [f, fs.readFileSync(path.join(corpusDir, f), 'utf8')]));
    const { unit, headers } = unitOf(d, texts);
    for (const lang of LANGS) {
      const r = cosimulate(unit, { file: d.language === 'c' ? 'unit.c' : 'unit.cpp', headers, top: d.top, files: texts, lang, directives: d.directives });
      assert.deepEqual(r.errors, [], `${name} ${lang}`);
      assert.equal(r.pass, true, `${name} ${lang} ${JSON.stringify(r.mismatches.slice(0, 3), big)}`);
      assert.deepEqual(comparePorts(r.gen.ports, (vitis.designs || vitis)[name].vitis.ports), { same: true, missing: [], extra: [], differ: [] }, `${name} ${lang}`);
      assert.deepEqual(msgs(r.gen), warnings, `${name} ${lang}`);
    }
  }
});
