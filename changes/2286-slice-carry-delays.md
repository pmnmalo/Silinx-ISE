In short:

- **Timing of counters and adders as ISE's:** the Silinx toolchain's minimum period of a design with carry chains
  (counters, adders) was up to 7 % under ISE's trce; it is now within about 1 % (blinky: 7.037 ns, trce 7.075).

In detail:

- **The Silinx toolchain's delays of a slice's carry chain (#2286):** the delays through the carry's XORs and onto the
  slice's XB output are trce's instead of estimates, in the timing analysis, the placer and router, and the
  post-place & route simulation model. Designs with carry chains report a longer, truer minimum period and may be
  placed and routed differently.
