In short:

- **Silinx HLS:** `hls_vector.h`, `hls_streamofblocks.h`, `<complex>` (with `hls::axis`), and in a test bench
  `ap_float.h`, `hls::autorestart` and `malloc.h`; five more of AMD's examples go through C simulation, synthesis and
  co-simulation.

In detail:

- **Silinx HLS: the Vitis library headers the corpus uses (#1891):** core/cpp-hls-lib.js and core/cpp-vector.js:
  `hls::vector` (a struct of an array: `v[i]`, element-wise `+ - * /`), `hls::stream_of_blocks` with its locks (a block a
  word of a FIFO), `std::complex` (`real`, `imag`, a list, `==`, `!=`), `hls::axis<T, …>`, `ap_float` (a double in a test
  bench, with a warning; refused in the synthesized code), `hls::autorestart`, `malloc` and `free` in the C simulation.
  Also a stream of a struct with an array member (a stream per element), `extern "C"`, a typedef of `hls::stream`, a
  parameter `T (&a)[N]` deduced. modeling-using-array-stencil-2d passes `malloc.h` and now stops at `<map>`, `<string>`
  and `<chrono>` of its command-line parser. Test: test/cpp-hls-lib.test.js.
