// sort: a bubble sort of 8 numbers in place. The array argument becomes a memory port (its address, data in and
// out, write enable); the two loops a state machine reading and writing it.
// Silinx test design (#1746). Copyright 2026 Pedro Maló. AGPL-3.0-only.
#include <stdio.h>

#define N 8

void sort(int a[N]) {
  for (int i = 0; i < N - 1; i++) {
    for (int j = 0; j < N - 1 - i; j++) {
#pragma HLS LOOP_TRIPCOUNT max=7
#pragma HLS PIPELINE off
      // (not pipelined: its swap reads and writes the memory's one port, a state each)
      if (a[j] > a[j + 1]) {
        int t = a[j];
        a[j] = a[j + 1];
        a[j + 1] = t;
      }
    }
  }
}

// the test bench: three arrays sorted, each checked in order and with the same sum as before
int main(void) {
  int all[3 * N] = {5, -2, 9, 0, 7, 7, -8, 1, 8, 7, 6, 5, 4, 3, 2, 1, 1, 2, 3, 4, 5, 6, 7, 8};
  int errors = 0;
  for (int k = 0; k < 3; k++) {
    int t[N], before = 0, after = 0;
    for (int i = 0; i < N; i++) { t[i] = all[k * N + i]; before += t[i]; }
    sort(t);
    for (int i = 0; i < N; i++) { after += t[i]; printf("%d ", t[i]); }
    printf("\n");
    for (int i = 0; i + 1 < N; i++) if (t[i] > t[i + 1]) errors++;
    if (before != after) errors++;
  }
  printf(errors ? "FAIL: %d error(s)\n" : "PASS\n", errors);
  return errors;
}
