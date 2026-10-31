In detail:

- **Silinx HLS: the co-simulation's bench (#2368):** the Verilog test bench of a sequential top declares `ap_rst` once;
  it was declared twice, which Silinx's simulator accepted, with the same results.
