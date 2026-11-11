// Silinx HLS: AXI4 bursts on m_axi (#2276, core/c-axi-master.js): a read that misses fetches a burst (ARLEN > 0) into its
// port's buffer, the next reads of it served at once; consecutive writes gathered into a burst (AWLEN > 0), written out
// when the buffer is full, a write does not follow, a read misses or the function is done (ap_done after them). Each
// design co-simulated in VHDL and Verilog through the buses' model (its handshakes now and then late, a fault printed),
// its warnings asserted; the bursts counted on the bus, and the latency against a beat at a time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

const LANGS = ['vhdl', 'verilog'];
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const AUTO = (line, ii, mem, n) => `${line} warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=${ii} made (the memory '${mem}' has one port, accessed ${n} times an iteration); #pragma HLS PIPELINE off in it turns that off`;
const msgs = (gen) => gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);

/** The source co-simulated in VHDL and Verilog: its latency the same in both, its warnings. */
function cosim(src, warnings, top, opts = {}) {
  const out = LANGS.map((lang) => {
    const r = cosimulate(src, { file: 'a.cpp', lang, top, ...opts });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.deepEqual(msgs(r.gen), warnings, lang);
    return r;
  });
  assert.deepEqual(out[0].latency, out[1].latency);
  return out[0];
}

const COPY = (n, pr = '') => `void f(int *src, int *dst) {
#pragma HLS INTERFACE m_axi port=src depth=${n} bundle=gmem ${pr}
#pragma HLS INTERFACE m_axi port=dst depth=${n} bundle=gmem ${pr}
  for (int i = 0; i < ${n}; i++) dst[i] = src[i] * 3 + 1;
}
int main() {
  int a[${n}], b[${n}];
  for (int i = 0; i < ${n}; i++) a[i] = i * 7 - 50;
  f(a, b);
  for (int i = 0; i < ${n}; i++) if (b[i] != a[i] * 3 + 1) return 1;
  return 0;
}
`;

test('#2276 a copy of 40 words: the reads in bursts of 16 (and the rest), the writes gathered into bursts of 16; fewer cycles than a beat at a time', () => {
  // (the bus model's beats each a memory's access and a handshake now and then late: 277 cycles; a beat at a time, 486)
  const r = cosim(COPY(40), [], 'f');
  assert.equal(r.latency.max, 277);
  // (ARLEN and AWLEN the bursts' lengths less 1, from the adapter's register)
  const g = cToHdl(COPY(40), { file: 'a.cpp', top: 'f', lang: 'verilog' });
  assert.match(g.hdl, /assign m_axi_gmem_ARLEN = ap_t\d+;/);
  // (max_read_burst_length=1 and max_write_burst_length=1: a beat a burst, as before)
  const one = cosim(COPY(40, 'max_read_burst_length=1 max_write_burst_length=1'), [], 'f');
  assert.equal(one.latency.max, 478);
});

test('#2276 a read after a write of the same element (in place): the write in the read buffer, the value read the one written', () => {
  cosim(`void f(int *d) {
#pragma HLS INTERFACE m_axi port=d depth=20
  for (int i = 0; i < 20; i++) d[i] = d[i] + i;
  for (int i = 1; i < 20; i++) d[i] = d[i] + d[i - 1];
}
int main() {
  int d[20];
  for (int i = 0; i < 20; i++) d[i] = 3 * i - 7;
  f(d);
  int s = 3 * 0 - 7 + 0;
  for (int i = 1; i < 20; i++) { s += 3 * i - 7 + i; if (d[i] != s) return 1; }
  return 0;
}
`, [AUTO(3, 2, 'd', 2), AUTO(4, 3, 'd', 3)], 'f');
});

test('#2276 bytes and shorts on a 32-bit bus: several elements a beat, the strobes of each; a struct\'s members', () => {
  cosim(`struct P { short x; char y; };
void f(char *a, short *b, int n) {
#pragma HLS INTERFACE m_axi port=a depth=10 bundle=gmem
#pragma HLS INTERFACE m_axi port=b depth=10 bundle=gmem
  for (int i = 0; i < 10; i++) { b[i] = a[i] * n; a[i] = (char)(i + n); }
}
int main() {
  char a[10]; short b[10];
  for (int i = 0; i < 10; i++) a[i] = (char)(i * 5 - 20);
  f(a, b, 3);
  for (int i = 0; i < 10; i++) if (b[i] != (short)((i * 5 - 20) * 3) || a[i] != (char)(i + 3)) return 1;
  return 0;
}
`, [AUTO(5, 2, 'a', 2)], 'f');
});

test('#2276 a call\'s writes out before ap_done: the next call reads what the last one wrote, through s_axilite\'s control', () => {
  cosim(`void f(int *d, int k) {
#pragma HLS INTERFACE m_axi port=d depth=6
#pragma HLS INTERFACE s_axilite port=k
#pragma HLS INTERFACE s_axilite port=return
  for (int i = 0; i < 6; i++) d[i] = d[i] * 2 + k;
}
int main() {
  int d[6] = { 1, 2, 3, 4, 5, 6 };
  f(d, 1); f(d, 2); f(d, 3);
  return d[5] == ((6 * 2 + 1) * 2 + 2) * 2 + 3 ? 0 : 1;
}
`, [AUTO(5, 2, 'd', 2)], 'f');
});

test('#2276 a pipelined function writing over m_axi in its last stage: ap_done after the write is out (the corpus\'s interface-memory-ram-uram)', () => {
  cosim(`void f(bool w, int a, int *o) {
#pragma HLS INTERFACE m_axi port=o depth=1
#pragma HLS PIPELINE II=1
  if (w) *o = a * 3 + 1;
}
int main() {
  int o = 0, e = 0;
  for (int i = 0; i < 12; i++) { f(i % 3 != 1, i, &o); if (o != (i % 3 != 1 ? i * 3 + 1 : (i - 1) * 3 + 1)) e = 1; }
  return e;
}
`, [], 'f');
});
