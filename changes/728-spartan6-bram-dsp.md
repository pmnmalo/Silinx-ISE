In detail:

- **Spartan-6: the block RAM's and the DSP48A1's bits (#728):** every RAMB16BWER, RAMB8BWER and DSP48A1 setting the
  primitives offer, the block RAM's contents (in either of the RAMB16BWER's two orders, by its ports' widths), INIT and
  SRVAL as wide as their ports, and a clock pin's bits when it has a net, measured with ISE (research/s6/gen-hard6.mjs,
  ana-hard6.mjs: research/s6/db/xc6slx16-hard.json and xc6slx45-hard.json, the same offsets on both parts;
  research/s6/residual6.mjs predicts them with hard6.mjs); the stopwatch example ISE implemented has every bit
  explained on both boards, the BRAM frames included. The HCLK feedthrough PIPs to the lower half of a clock row are
  #1957. Tests: test/s6-hard.test.js.
