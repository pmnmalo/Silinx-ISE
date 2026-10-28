In short:
- **Silinx HLS: unions and bit-fields:** a union of integers, floats and structs of bit-fields (float_num_t's `mant`,
  `bexp`, `sign`), and a struct's bit-fields, in the C simulation and in hardware, laid out as GCC on x86.

In detail:
- **Silinx HLS: unions and bit-fields (#1896):** a union is one word of its size (up to 64 bits), its members views of
  its bits as GCC lays them out on x86 (from the least significant bit; a bit-field moved to the next unit of its type
  when it does not fit): a member read is its bits (a float's or a double's the same bits, `ap_bits_float` /
  `ap_bits_double`), written into the word with the others kept; an anonymous struct's members are the union's, a
  named struct's and an array member's reached too; a union variable, parameter, pointer (`p->m`) or array is its
  word, `{ e }` its first member's value. A struct's bit-field `T m : W` is a member of `W` bits, wrapped as C wraps
  it. AMD's modeling-using-float-and-double now passes the C simulation, the synthesis and the co-simulation.
