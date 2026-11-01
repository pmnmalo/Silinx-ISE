// Silinx HLS, #pragma HLS BIND_STORAGE impl=, ARRAY_RESHAPE and STREAM outside a stream's depth (#1961). Each case
// co-simulated in VHDL and Verilog (a pass: the C's results), its memories, the tools' attribute and its exact warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';

const P = '#pragma HLS ';
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const src = (pr) => `#include <stdio.h>
int f(int a, int k) {
  int m[100];
${pr}
  for (int i = 0; i < 100; i++) m[i] = a + i;
  int s = 0;
  for (int i = 0; i < 100; i += 3) s += m[i] ^ k;
  return s;
}
int main(void) { for (int i = 0; i < 3; i++) printf("%d ", f(i * 7, i)); return 0; }
`;
function run(pr) {
  const [v, vl] = ['vhdl', 'verilog'].map((lang) => {
    const r = cosimulate(src(pr), { file: 't.c', lang, top: 'f' });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang}: ${JSON.stringify(r.mismatches, big)}`);
    return r;
  });
  return { mems: v.gen.report.memories.map((m) => [m.name, m.words]), vhdl: v.gen.hdl, verilog: vl.gen.hdl, messages: v.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`) };
}

test('#1961 BIND_STORAGE impl=lutram, bram: the tools told, in both languages; no impl: nothing said', () => {
  const none = run('');
  assert.deepEqual([none.mems, none.messages, /_style/.test(none.vhdl), /_style/.test(none.verilog)], [[['m', 100]], [], false, false]);
  for (const [impl, style] of [['lutram', 'distributed'], ['bram', 'block']]) {
    const r = run(`${P}BIND_STORAGE variable=m type=ram_1p impl=${impl}`);
    assert.deepEqual(r.messages, []);
    assert.ok(r.vhdl.includes(`attribute ram_style of ap_m_m : signal is "${style}";`), impl);
    assert.ok(r.verilog.includes(`(* ram_style = "${style}" *) reg [31:0] ap_m_m`), impl);
  }
});

test('#1961 BIND_STORAGE impl=register: no memory', () => {
  const r = run(`${P}BIND_STORAGE variable=m type=ram_1p impl=register`);
  assert.deepEqual([r.mems, r.messages], [[], []]);
});

test('#1961 BIND_STORAGE: what the device has not, its warning, the memory kept', () => {
  const cases = {
    'type=ram_2p impl=uram': '4 warning: #pragma HLS BIND_STORAGE impl=uram: the Spartan-3E has none: a block RAM made',
    'type=ram_1p impl=srl': '4 warning: #pragma HLS BIND_STORAGE impl=srl: not made: a shift register has no random access: its default memory made',
    'type=ram_1p latency=2': '4 warning: #pragma HLS BIND_STORAGE latency=2: not made: a read takes one cycle: ignored',
  };
  for (const [args, m] of Object.entries(cases)) assert.deepEqual(run(`${P}BIND_STORAGE variable=m ${args}`).messages, [m], args);
  const arg = cToHdl(`int f(int a[8]) {\n${P}BIND_STORAGE variable=a type=ram_1p impl=lutram\n  return a[1];\n}`, { file: 't.c', top: 'f' });
  assert.deepEqual(arg.diagnostics.map((d) => d.message), ["#pragma HLS BIND_STORAGE impl=lutram of the argument 'a': its memory is outside the module: ignored"]);
});

test('#1961 ARRAY_RESHAPE of a local: as a partition, said; of an argument: its port kept, said', () => {
  const said = "4 warning: #pragma HLS ARRAY_RESHAPE of 'm': made as ARRAY_PARTITION, its elements at once as in one wide word, in memories side by side";
  assert.deepEqual([run(`${P}ARRAY_RESHAPE variable=m cyclic factor=2`)].map((r) => [r.mems, r.messages]), [[[['m_0', 50], ['m_1', 50]], [said]]]);
  assert.deepEqual(run(`${P}ARRAY_RESHAPE variable=m block factor=4 dim=1`).mems.length, 4);
  assert.deepEqual(run(`${P}ARRAY_RESHAPE variable=m complete`).mems, []);
  const arg = cToHdl(`int f(int a[8]) {\n${P}ARRAY_RESHAPE variable=a cyclic factor=2\n  return a[1];\n}`, { file: 't.c', top: 'f' });
  assert.deepEqual(arg.diagnostics.map((d) => d.message), ["#pragma HLS ARRAY_RESHAPE of the argument 'a': not made: its port's words kept, one element each"]);
  assert.ok(arg.ports.some((p) => p.name === 'a_q0' && p.w === 32));
});

const REGION = (pr) => `#include <hls_stream.h>
void w(hls::stream<int> &o, int b[4]) { for (int i = 0; i < 4; i++) { o.write(i); b[i] = i; } }
void r(hls::stream<int> &i, int b[4], hls::stream<int> &o) { for (int k = 0; k < 4; k++) o.write(i.read() + b[k]); }
void f(hls::stream<int> &o) {
${P}DATAFLOW
  hls::stream<int> s;
  int b[4];
${pr}
  w(s, b);
  r(s, b, o);
}
`;
test('#1961 STREAM: its depth in a DATAFLOW region; another type, an array, or outside a region: its warning', () => {
  const m = (pr) => cToHdl(REGION(pr), { file: 't.cpp', top: 'f' }).diagnostics.map((d) => d.message);
  assert.deepEqual(m(`${P}STREAM variable=s depth=8`), []);
  assert.deepEqual(m(`${P}STREAM variable=s type=fifo depth=8`), []);
  assert.deepEqual(m(`${P}STREAM variable=s type=shared`), ['#pragma HLS STREAM variable=s type=shared: not made: a stream is a FIFO']);
  assert.deepEqual(m(`${P}STREAM variable=s depth=x`), ['#pragma HLS STREAM depth=x: not a whole number: its default depth made']);
  assert.deepEqual(m(`${P}STREAM variable=b type=pipo`), []);
  assert.deepEqual(m(`${P}STREAM variable=b off`), []);
  assert.deepEqual(m(`${P}STREAM variable=b depth=4`), ['#pragma HLS STREAM variable=b: not made: a local array stays a buffer (PIPO): its readers start once its writer is done']);
  assert.deepEqual(run(`${P}STREAM variable=m depth=4`).messages, ['4 warning: #pragma HLS STREAM variable=m: outside a DATAFLOW region: no effect: nothing runs at once to fill a FIFO']);
});
