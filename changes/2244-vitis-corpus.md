In detail:

- **The HLS corpus against Vitis HLS, measured again (#2244):** `test/hls-corpus/vitis.json` and the README's table from
  a new Vitis HLS 2025.2 run of the 73 designs, with the modules recorded: 68 pass C simulation and co-simulation in
  both, their ports the same; Silinx skips the co-simulation of 5 (the floating-point FFTs, ECC flags, URAM), and the
  ports of 4 still differ (a struct's aggregation, pointers to double, vectors, the control-driven FIFO channels).
