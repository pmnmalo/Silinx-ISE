// Silinx HLS with an RTL blackbox (#2341): the C function adder is replaced in the hardware by a hand-written module of
// the project (adder.json describes it; adder_model.cpp is its C model, for the C simulation), here in the other
// language than the generated HDL. mac adds the two numbers through it, modulo 256, and keeps the larger of the sum and a.
#include "ap_int.h"
typedef ap_uint<8> data_t;

void adder(data_t a, data_t b, data_t &z);

void mac(data_t a, data_t b, data_t &s) {
  data_t t;
  adder(a, b, t);
  s = t > a ? t : a;
}

// the test bench: every a, with a b of each, 0 returned when every result is right
int main() {
  for (int a = 0; a < 256; a++) {
    int b = (a * 37 + 11) & 255, sum = (a + b) & 255;
    data_t s;
    mac(a, b, s);
    if (s != (sum > a ? sum : a)) return 1;
  }
  return 0;
}
