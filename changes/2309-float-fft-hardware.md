In short:

- **Silinx HLS:** a floating-point `hls::fft` (`use_native_float`) now has its hardware, so AMD's three float SSR FFT examples pass synthesis and co-simulation.

In detail:

- **The hardware of a floating-point `hls::fft` (#2309):** the top is the transform's own module, in VHDL or Verilog, as the fixed point's (#1943): the values in a block RAM, the twiddles (truncated toward zero) in a ROM, and one floating-point adder and one multiplier, made by Silinx HLS from its soft-float library (#1761), so every output is the C model's to the last bit. Radix-2 decimation in frequency, one butterfly at a time, the output in natural order; arrays and streams of `hls::vector<std::complex<float>, super_sample_rate>`, forward and inverse. `dsp-fft-interface-array-float-ssr2`, `dsp-fft-interface-stream-float-ssr2` and `dsp-fft-logicore-fft-float-ssr` pass synthesis and co-simulation. 1024 points take 6 block RAMs, 4 multipliers and about 6,200 LUTs: a Nexys2's XC3S500E or larger, not a Basys2.
