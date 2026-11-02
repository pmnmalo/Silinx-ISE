In detail:

- **Silinx HLS co-simulation: a malloc'ed buffer given to an array argument (#2592):** a test bench that passes a buffer
  from `malloc`, or a pointer into an array (`&a[0][0]`), to the top function's array argument gives the module its
  elements from there, as C does; it was taken as a pointer to one value, so the module never saw the buffer and the
  outputs differed from the C's (AMD's `using_array_stencil_2d`, its coefficients).
