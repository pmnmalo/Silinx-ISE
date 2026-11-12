In detail:

- **Names of `Object.prototype`'s are a design's own names (#3560):** the tables a design's names are looked up in
  (Verilog's SystemVerilog atom types and wired nets, the time units, VHDL's physical units) have no prototype, so
  `wire toString;`, `reg constructor;` or `input valueOf` are declarations, no longer "expected identifier but found
  ';'".
