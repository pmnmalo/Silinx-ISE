In detail:

- **Silinx HLS: no unused register in a pipelined loop (#2990):** a register the machine never writes nor reads (a
  pipelined loop's read of a local memory, or a variable of its body, whose values the pipeline's registers hold) is
  no longer made, so Check Syntax's design checks no longer say `Signal <ap_r_ap_mem_m_0> is assigned but never used`;
  the report's register bits count them no more.
