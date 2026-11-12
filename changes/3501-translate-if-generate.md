In short:

- **An if generate translated with its body, both ways.** A Verilog module's if generate shown in VHDL lost its body;
  a VHDL architecture's if generate could not be shown in Verilog at all. Now every form translates: an if alone, with
  an else, an else if / elsif chain, a case generate.

In detail:

- **If generates in the translations (#3501).** The translations read an if generate's items and its else as neither
  parser writes them (`items`, `else.items`): Verilog to VHDL dropped the body with no error, and VHDL to Verilog
  refused every if generate as one "with elsif branches". Both now read the branches as the parsers write them
  (core/translate-util.js, `ifGenerateBranches`: `then`, `else`, an else if or elsif chain, a case generate's
  alternatives, read in a loop). To VHDL, each branch is an if generate of its own (VHDL-93: no elsif or else generate,
  as XST reads it) on its condition and the earlier ones negated, its declarations before its `begin`; to Verilog, an
  else if chain of named blocks, the `generate` … `endgenerate` keywords around the outermost generate only (generate
  regions do not nest). What a branch holds that has no translation is an error at its line.
