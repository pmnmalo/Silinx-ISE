In short:

- **An HDL source in the other language, translated:** in the Design pane, a Verilog module of a VHDL project has a
  [VHDL] badge after its [Verilog] one (and a VHDL module of a Verilog project a [Verilog] badge): it opens the module
  translated to the project's language, read-only, made again when the source is saved. What cannot be translated is
  said, with its line.

In detail:

- **VHDL ↔ Verilog translation in the Design pane (#2693):** the badge of the Preferred Language on the row of an HDL
  module in the other language (web/js/translation.js) opens its file translated by a new translator (core/translate.js,
  translate-to-verilog.js, translate-to-vhdl.js, translate-vhdl-expr.js) working on the parsers' IR: generics and
  parameters, ports, signals, constants, enumerated types (localparams), memories and ROM tables, processes and always
  blocks (clocked, with an asynchronous reset, combinational, a test bench's with waits and delays), if / case / for /
  while, concurrent assignments (when/else, with/select, ?:), instances, generates, functions, the numeric_std
  conversions; VHDL's names in their spelling, reserved words renamed (said in the header), an output read inside the
  module an internal signal, a ?: inside an expression or an expression in a port map an intermediate signal. Records,
  procedures, tasks, casez with don't-care bits and a few more have no translation: the document says which, with the
  line. The comments are not carried over. Every example's design sources translate both ways, and their test benches
  pass with the translations swapped in (test/translate.test.js).
