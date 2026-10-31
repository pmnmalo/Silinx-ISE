In short:

- **Silinx HLS:** `hls_fft.h` (`hls::fft`): a fixed-point FFT bit-exact with Vitis HLS's C model on AMD's stimulus and golden
  files, with Silinx's own hardware (VHDL and Verilog) and Vitis HLS's ports; two more of AMD's examples go through C
  simulation, synthesis and co-simulation.

In detail:

- **Silinx HLS: hls::fft (#1943):** core/hls-fft.js (the parameters, each one Silinx does not make refused; the transform,
  radix-4 decimation in frequency, the twiddle product rounded at 5 guard bits and truncated by the stage's scale, as found
  against the 20 golden frames), core/cpp-fft.js (the config struct, the call a C model's), core/hls-fft-hdl.js (a block RAM,
  a ROM, four 18x18 multipliers; 26,626 cycles for 1024 points where Vitis HLS's takes 3,198). dsp-fft-interface-array and
  dsp-fft-interface-stream pass all three stages, their ports as Vitis HLS's. The floating-point designs are not done: a
  float C model close to AMD's but not bit-exact, its synthesis refused, and the corpus's three float designs still fail their
  C simulation (#2309).
  Also `std::complex<T>(re, im)`, a typedef's constructor and `std::complex` as a general type; in a test bench `fgetc`, `strcat`,
  `memcpy` of one value, `ldexp`, `fscanf`'s `%X` and `%f`, `<string>` and `<sstream>`; co-simulation of an `ap_fifo` array and
  pointer. Tests: test/hls-fft.test.js, test/cpp-fft.test.js, test/hls-fft-hdl.test.js.
