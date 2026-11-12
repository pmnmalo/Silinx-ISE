// The templates of a new C or C++ source (New Source ▸ C Function (HLS), C++ Function (HLS); Silinx HLS, docs/c-to-hdl.md):
// its top function, its ports explained, a test bench. No DOM: the unit tests read them too.

/** A new C source (Silinx HLS, docs/c-to-hdl.md): its top function, its ports explained, a test bench (#1531). */
export function cTemplate(name) {
  return [
    `// ${name}: a C function made into hardware by Silinx HLS (compatible with AMD's Vitis HLS).`,
    '// The top function becomes a module: an argument passed by value is an input port, a pointer argument',
    '// written is an output port (with its _ap_vld), the returned value is ap_return; ap_start, ap_done,',
    '// ap_idle and ap_ready start a call and say when it is done. See docs/c-to-hdl.md.',
    '#include "ap_int.h"',
    '#include <stdio.h>',
    '',
    `void ${name}(ap_uint<4> a, ap_uint<4> b, ap_uint<5> *sum, bool *carry) {`,
    '  ap_uint<5> s = a + b;',
    '  *sum = s;',
    '  *carry = s[4];',
    '}',
    '',
    '// the test bench: main() is never made into hardware',
    'int main(void) {',
    '  ap_uint<5> sum;',
    '  bool carry;',
    `  ${name}(9, 8, &sum, &carry);`,
    '  printf("9 + 8 = %d (carry %d)\\n", (int)sum, (int)carry);',
    '  return 0;',
    '}',
    '',
  ].join('\n');
}

/** A new C++ source (#1590): its top function (references its outputs, a template), a test bench with std::cout. */
export function cppTemplate(name) {
  return [
    `// ${name}: a C++ function made into hardware by Silinx HLS (compatible with AMD's Vitis HLS).`,
    '// The top function becomes a module: an argument passed by value is an input port, a reference written',
    '// is an output port (with its _ap_vld), the returned value is ap_return; ap_start, ap_done, ap_idle and',
    '// ap_ready start a call and say when it is done. See docs/c-to-hdl.md.',
    '#include "ap_int.h"',
    '#include <iostream>',
    '',
    '// a template: one adder per width it is used with',
    'template <int W> ap_uint<W + 1> add(ap_uint<W> a, ap_uint<W> b) { return a + b; }',
    '',
    `void ${name}(ap_uint<4> a, ap_uint<4> b, ap_uint<5> &sum, bool &carry) {`,
    '  ap_uint<5> s = add<4>(a, b);',
    '  sum = s;',
    '  carry = s[4];',
    '}',
    '',
    '// the test bench: main() is never made into hardware',
    'int main() {',
    '  ap_uint<5> sum;',
    '  bool carry;',
    `  ${name}(9, 8, sum, carry);`,
    '  std::cout << "9 + 8 = " << sum << " (carry " << carry << ")" << std::endl;',
    '  return 0;',
    '}',
    '',
  ].join('\n');
}

// ------------------------------------------------------------------ the C editor's Language Templates (#1855)
// As the HDL editor's (web/js/editor.js's SNIPPETS): ${name} the file's name, $0 where the cursor goes; cpp: C++ only.
// test/c-templates.test.js synthesizes each (in a top function where it is a statement) and runs its C simulation.
export const C_SNIPPETS = [
  { name: 'includes', text: '#include "ap_int.h"\n#include <stdio.h>\n$0' },
  { name: 'top function (ports)', text: '// inputs by value, outputs by pointer (their _ap_vld), the result ap_return\nvoid ${name}(ap_uint<8> a, ap_uint<8> b, ap_uint<9> *sum) {\n  *sum = a + b;$0\n}\n' },
  { name: 'test bench (main)', text: '// the test bench: main() is never made into hardware\nint main(void) {\n  int errors = 0;\n  $0\n  printf("%d error(s)\\n", errors);\n  return errors != 0;\n}\n' },
  { name: 'ap_uint / ap_int', text: 'ap_uint<8> u = 200;   // 8 bits, unsigned\nap_int<12> v = -5;    // 12 bits, signed\n$0' },
  { name: 'bits and ranges', text: 'bool b3 = x[3];                  // bit 3\nap_uint<4> hi = x.range(7, 4);   // bits 7 to 4\n$0' },
  { name: 'ap_fixed', text: '// #include "ap_fixed.h"\nap_fixed<16, 8> k = 0.75;   // 16 bits, 8 of them the integer part\n$0' },
  { name: 'for loop (PIPELINE)', text: 'for (int i = 0; i < 8; i++) {\n#pragma HLS PIPELINE II=1\n  $0\n}' },
  { name: 'for loop (UNROLL)', text: 'for (int i = 0; i < 4; i++) {\n#pragma HLS UNROLL\n  $0\n}' },
  { name: 'loop of a variable count (LOOP_TRIPCOUNT)', text: 'for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=64\n  $0\n}' },
  { name: 'array argument (ap_memory)', text: '// an array argument: a memory outside the module (ap_memory)\nint sum8(const int a[8]) {\n  int s = 0;\n  for (int i = 0; i < 8; i++) s += a[i];\n  return s;$0\n}\n' },
  { name: 'ROM (a constant table)', text: 'static const ap_uint<8> ROM[8] = {1, 2, 4, 8, 16, 32, 64, 128};   // a ROM\n$0' },
  { name: 'static register (counter)', text: '// a static variable: a register kept between calls, its initial value at the reset\nap_uint<8> counter(bool inc) {\n  static ap_uint<8> count = 0;\n  if (inc) count++;\n  return count;$0\n}\n' },
  { name: 'struct argument', text: '// a struct argument: one port of its members\ntypedef struct { ap_uint<8> re; ap_uint<8> im; } pair_t;\n$0' },
  { name: 'hls::stream (read, write)', cpp: true, text: '// #include "hls_stream.h"\nvoid ${name}(hls::stream<int> &din, hls::stream<int> &dout) {\n  int x = din.read();\n  dout.write(x + 1);$0\n}\n' },
  { name: 'DATAFLOW (two processes, a stream)', cpp: true, text: '// #include "hls_stream.h"\nstatic void stage1(const int a[8], hls::stream<int> &s) {\n  for (int i = 0; i < 8; i++) s.write(a[i] * 2);\n}\nstatic void stage2(hls::stream<int> &s, int b[8]) {\n  for (int i = 0; i < 8; i++) b[i] = s.read() + 1;\n}\nvoid ${name}(const int a[8], int b[8]) {\n#pragma HLS DATAFLOW\n  hls::stream<int> s;\n  stage1(a, s);\n  stage2(s, b);$0\n}\n' },
  { name: 'hls::task (data-driven)', cpp: true, text: '// #include "hls_task.h"\nstatic void inc(hls::stream<int> &in, hls::stream<int> &out) {\n  out.write(in.read() + 1);\n}\nvoid ${name}(hls::stream<int> &din, hls::stream<int> &dout) {\n#pragma HLS DATAFLOW\n  hls_thread_local hls::stream<int> mid;\n  hls_thread_local hls::task t1(inc, din, mid);\n  hls_thread_local hls::task t2(inc, mid, dout);$0\n}\n' },
];
/** The templates of a C or C++ source: a .c one's without C++'s. */
export const cSnippets = (path) => C_SNIPPETS.filter((s) => !s.cpp || /\.(cpp|cc|cxx|hpp|hh)$/i.test(path));
