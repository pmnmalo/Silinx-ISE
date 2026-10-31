// Silinx example (isqrt): the integer square root of an 8-bit number, a C function made into hardware
// by Silinx HLS: n = root * root + remainder. The numbers 1, 3, 5, 7... added up are the squares
// (1, 4, 9, 16...), so the root is how many of them fit in n. How many fit depends on n: the loop is
// a state machine that takes as many clock cycles as it needs (C/RTL Co-simulation shows them).
// Its HDL is generated from this file, and isqrt_top.vhd instances it as any other module.
#include <stdio.h>
#include "ap_int.h"

ap_uint<4> isqrt(ap_uint<8> n, ap_uint<5> *remainder) {
  ap_uint<8> left = n;
  ap_uint<6> odd = 1;
  ap_uint<4> root = 0;
  while (left >= odd) {
#pragma HLS LOOP_TRIPCOUNT max=15
    left = left - odd;
    odd = odd + 2;
    root = root + 1;
  }
  *remainder = left;
  return root;
}

// the test bench (C Simulation, C/RTL Co-simulation): main() is never made into hardware; every number,
// and 0 returned when every result is right
int main(void) {
  int errors = 0;
  for (int n = 0; n < 256; n++) {
    ap_uint<5> r;
    int root = isqrt(n, &r);
    int rem = r;
    if (root * root + rem != n || rem > 2 * root) {
      printf("isqrt(%d) = %d, remainder %d: wrong\n", n, root, rem);
      errors++;
    }
  }
  ap_uint<5> r;
  int root = isqrt(200, &r);
  int rem = r;
  printf("isqrt(200) = %d, remainder %d\n", root, rem);
  printf(errors ? "FAIL: %d wrong result(s)\n" : "PASS\n", errors);
  return errors;
}
