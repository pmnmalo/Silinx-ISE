In short:

- **Silinx HLS: `#pragma HLS ARRAY_STENCIL`:** a filter over a 2-D array reads each element once, through line buffers
  and a window of registers, its loop at II=1.

In detail:

- **Silinx HLS: `#pragma HLS ARRAY_STENCIL` as Vitis HLS makes it (#2503):** a pipelined loop over a 2-D array's
  columns, in a loop over its rows, whose body reads `a[y + i][x + j]` (constants or its inner loops' counters, directly or
  through variables) becomes one loop over the array's elements: an element read an iteration, kept in line buffers (a
  memory of a row for each row of the window but the last) and a window of registers, its outputs in the C's order. A
  local array the body reads at constant indices, a filter's coefficients, is made registers. What cannot be made so is
  said with a warning; the pragma was ignored before. AMD's `using_array_stencil_1d` reaches II=1 (was 3), its latency
  113983 cycles (was 225576); `using_array_stencil_2d` reaches II=1 (was 225) and passes its co-simulation, which it had
  never run: the corpus's 73 designs
  all pass every stage. Both are still far from Vitis HLS's latency, its AXI bursts above all (#2613).
- **Silinx HLS: a pipeline's shift register from a memory at II=1 (#2503):** a variable whose next value is another's,
  written in a later stage (`s0 = s1; s1 = a[i];`), is read where that one is written and its readers no earlier, so the
  II asked is kept; it was raised by one. Tried only when the II asked otherwise fails: the other designs' schedules are
  unchanged.
- **Silinx HLS co-simulation: the C simulation's limit of steps (#2503):** `cosimulate(…, { maxSteps })` gives its C
  simulation the limit a long test bench needs, as `simulateC` takes it.
