In short:

- Silinx HLS: a C++ test bench's class with `std::string` and `std::map` members (a command-line parser, with virtual functions and iterators) runs in the C simulation.

In detail:

- Silinx HLS: a test bench's classes and functions over `std::string` and `std::map` (`<map>`, `<chrono>`, nested classes, overloads, default and reference arguments, `new` and `delete`, iterators, `main(argc, argv)`) are taken out of the source and run by the C simulation alone; the synthesized function cannot reach them, and what is not read is reported at its line (#2234).
- Silinx HLS: `&a[0][0]` points into the whole array in the C simulation (`memcpy` of a two-dimensional array), and `a[i][j]` no longer copies its row (#2234).
- Silinx HLS: the corpus's `modeling-using-array-stencil-2d` passes C simulation and C synthesis; its co-simulation is not run until `#pragma HLS ARRAY_STENCIL` (#2503) makes its II 1 (#2234).
