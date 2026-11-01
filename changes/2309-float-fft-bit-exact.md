In short:

- **Silinx HLS:** the C simulation of a floating-point `hls::fft` now gives AMD's values to the last bit on its 1024-point SSR 2 examples, so the two designs that compare floats with `==` pass.

In detail:

- **`hls::fft`'s floating-point transform bit-exact with AMD's C model (#2309):** radix-2 decimation in frequency in `float`, with `cos` and `sin` of double truncated toward zero to float rather than rounded, and an exact rotation at a quarter turn. Every value of the 10 forward frames of `dsp-fft-interface-array-float-ssr2` and `dsp-fft-interface-stream-float-ssr2` matches their golden files, and both pass C simulation; their synthesis stays refused (#1761). Other lengths, other super sample rates and the inverse follow the same rules, with no golden file to check them.
