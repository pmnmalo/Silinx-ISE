In detail:

- **Silinx HLS: the names Vitis HLS reserves renamed as it does (#1902):** an argument named `pos` (or `neg`) has
  its ports named `pos_r`, with a warning, as a reserved word of VHDL or Verilog already was (#1622); the names in
  one module, `core/c-names.js`. modeling-pointers-multiple-pointers's ports are now Vitis HLS's. The members of an
  array of nested structs are left to their aggregation (#1668).
