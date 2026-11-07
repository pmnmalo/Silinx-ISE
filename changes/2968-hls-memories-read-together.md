In short:

- **Silinx HLS, memories:** the reads of different memories in one statement are made in the same cycle
  (`return A[i] + B[i];` with two ROMs: 3 cycles → 2).

In detail:

- **The reads of different memories in one state (#2968):** a memory's read goes into the state of the read just
  before it, of another memory, when its address is known there and that memory's port is free there, as #1901's
  second read of a two-port memory does: each memory's ports kept, a read whose address another read gives still after
  it, two reads of one port a state apart. Not in a pipelined loop, whose schedule is its own. The HLS corpus's
  misc-initialization-and-reset-static-array-rom 3 → 2 cycles (Vitis HLS 1);
  interface-memory-manual-burst-manual-burst-with-conditionals 13282 → 12872 cycles (its third loop's II 9 → 7).
