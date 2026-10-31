In short:

- Silinx HLS: `#pragma HLS ARRAY_PARTITION` `type=block`, `type=cyclic factor=N` and `dim=2` of a two-dimensional array are made: several memories, an argument's each with its own port (`d_0_address0`, `d_1_address0`, …).

In detail:

- `core/c-partition.js`: an array partitioned as memories (`A_0`, `A_1`, …); an access of a memory known at synthesis is that memory's, another selects its memory by its index, in one state; the co-simulation's test bench fills each memory from the C's array; a pragma that cannot be made is said and ignored (#1920).
