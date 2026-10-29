In short:

- **Silinx HLS: the FIR filter, hls::FIR (hls_fir.h):** single rate, decimation and interpolation filters configured
  as in Vitis HLS (a struct derived from `hls::ip_fir::params_t`), run by the C simulation and made in hardware by
  Silinx's own multiply-accumulate; AMD's dsp-fir-decimator passes the C simulation, the synthesis and the
  co-simulation, with Vitis HLS's ports.

In detail:

- **Silinx HLS: hls::FIR, hls_fir.h's FIR filter (#1942, the first of the DSP libraries of #1892):** the config struct derived from `hls::ip_fir::params_t` is
  read with UG1399's fields and defaults (`coeff_vec` in it or defined after it, `config::num_coeffs` usable,
  `hls::ip_fir`'s constants) and checked: single rate, decimation and interpolation by an integer rate, one channel,
  coefficient sets chosen by the config argument, `integer_coefficients` and `quantize_only`, `full_precision` and
  `truncate_lsbs`; the parameters Silinx does not make (`reloadable`, `fixed_fractional`, `num_channels` > 1, the
  rounding modes, …) are refused, each named with why (`core/hls-fir.js`). A static filter's `run(in, out[, config])`,
  on arrays or streams, is a call of its C model in the C simulation (the inputs in the parameters' format, the sums
  in full precision as PG149 sizes them, the output's type taking the value; `core/cpp-fir.js`), and in synthesis a
  process of its own hardware (`core/hls-fir-hdl.js`): one 18x18 multiply-accumulate, the coefficients a ROM and the
  delay line a RAM (block RAMs when large enough), its ports Vitis HLS's (an array's two `ap_memory` ports, a stream's
  `ap_fifo`, the config `ap_none`). A DATAFLOW process may read a pointer argument of the top (an `ap_none` input).
  dsp-fir-decimator passes the C simulation, the synthesis and the co-simulation (latency 132 cycles, Vitis HLS's 32).
