In short:

- Silinx HLS: `hls::FIR` chooses its structure from the rate it must sustain (`sample_period`): several multipliers when
  one is too slow, a mirrored filter's pre-adder. The Vitis example dsp-fir-decimator takes 31 cycles a call, not 132
  (Vitis HLS 32).

In detail:

- **`hls::FIR`'s structure from its rate (#1947):** core/hls-fir.js's `firStructure` computes the MACs as PG149 does (the
  taps over an output's clocks, half of a mirrored filter's, at most 28 with a warning); core/hls-fir-hdl.js makes them,
  the delay line partitioned among them and read while inputs arrive, the products in a pipelined tree. A `coeff_structure`
  `symmetric` or `negative_symmetric` of coefficients not so mirrored is now refused. The default rate of a clock an input
  now makes a MAC a tap: a large filter should state its `sample_period`.
