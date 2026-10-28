In detail:

- **The HDL front end's boundary test (#1709, step 1 of `silinx-hdl`):** `test/hdl-boundary.test.js` lists the
  front end's 39 modules (what `core/compile.js`, `core/synth-verilog.js` and `core/unisim.js` reach: the VHDL and
  Verilog parsers, the elaborator, the interpreter and simulator, `core/values.js`, `core/native.js`,
  `core/util.js`, the flat Verilog's `core/synth-*.js`); an import from them into the rest of the IDE, or of an npm
  package, fails, and a module that is no longer reached must leave the list. No behaviour change.
