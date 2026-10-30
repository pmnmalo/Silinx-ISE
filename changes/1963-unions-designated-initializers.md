In short:

- **Silinx HLS:** unions of more than 64 bits, unions inside structs, `++` and `--` on a union's member and designated
  initializers (`{ .y = 2 }`, `{ [2] = 5 }`) now simulate and synthesize.

In detail:

- **Silinx HLS, unions and initializers (#1963):** a union over 64 bits is a word of its size (`ap_uint<N>`, its `sizeof`
  C's); a union in a struct, named or anonymous, is a member of the word's type, reached through the struct's chains
  (`s.u.m`, `p->u.m`, `a[i].u.m`) and its methods; a union in a union is a part of it; `++` and `--` on a member write it
  and give C's value; a new pass (`core/c-designated.js`) writes designated initializers, and those of a type with a
  union, in full by C's rules. The casts in a global's initial value now get their `ap_uint` width.
