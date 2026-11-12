In short:

- A signal, a module or a function named `toString`, `constructor`, `valueOf` or `__proto__` works in Verilog and in C.

In detail:

- **Names of `Object.prototype`'s are a design's own names (#3560):** the Verilog front end's and Silinx HLS's tables
  of built-ins (math.h's functions, the bit casts, the headers and their macros, the pragmas' values, the stdint
  types and sizes, the stream types and manipulators, hls::fft's and hls::FIR's constants and fields) have no
  prototype: `wire toString;` is a declaration, and an undeclared `toString(a)` is the C check's error "the function
  'toString' is not declared", where cToHdl and the C simulation failed. A test checks that every table of the front
  ends read with a computed key has no prototype, but those keyed by Silinx's own words.
