In short:

- Silinx HLS runs the C simulation of `hls::fft`'s floating-point SSR designs, their streams of
  `hls::vector<std::complex<float>, 2>`, and AMD's `logicore_fft_float_ssr` example passes it.

In detail:

- **Silinx HLS: hls::fft's float SSR test benches (#2309):** `hls::fft` takes streams of
  `hls::vector<std::complex<T>, super_sample_rate>` (a word of that many samples), in the C simulation; their
  synthesis stays refused (a floating-point FFT's hardware, #1761). A stream of `hls::vector` of structs (of
  `std::complex`) is one stream per member of each element, in the C simulation and in the hardware; `hls_vector.h`
  brings `<complex>` in first, so `hls::vector<C, N>` of a `std::complex` typedef is made. A test bench's struct may
  have `const char *` members (its texts: `printf`'s `%s`, `cout`, a `const char *` parameter, `fopen`; a struct of
  them as a parameter refused); `S a[] = { … }` takes the list's size; `sizeof` of a struct or an array of structs
  is g++'s (x86-64); a function's default arguments are given to the calls that leave them out; `if (!(f >> a >>
  b))` reads a file stream, and `f >> x` reads a float as a float. A shift by a constant count of the value's width
  or more (`1 << 32`), undefined in C, takes g++'s value in the C simulation (0, or -1 for a negative value shifted
  right) with a warning; a count known only when it runs still stops the run, and synthesis refuses both.
  `dsp-fft-logicore-fft-float-ssr` passes its C simulation; the two `*-float-ssr2` designs compare their floats
  with `==` and need AMD's own order of operations, not found yet.
