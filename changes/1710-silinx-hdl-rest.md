In detail:

- **The HDL front end's package, silinx-hdl, second part (#1710):** the rest of the front end moves into
  packages/silinx-hdl/src as it is, 19 modules: core/values.js, the interpreter (interp.js, interp-format.js,
  interp-textio.js), the simulator (simulator.js, native.js), the compilation and elaboration (compile.js,
  elaborate.js, elab-call.js, elab-expr.js, elab-instance.js, elab-stmt.js, bound-walk.js) and the flat Verilog
  (synth-verilog.js, synth-module.js, synth-operators.js, synth-stmts.js, synth-tables.js, synth-values.js). The
  package now holds the front end's 43 modules. Each old path in core/ re-exports its module, so the importers are
  unchanged. The HDL boundary's test lists the whole front end in the package, and its entry points are the package's
  compile.js, synth-verilog.js and unisim.js. The private-data check knows the moved elaboration's VHDL section
  numbers. ARCHITECTURE.md, ONBOARDING.md and TOOLCHAIN-SEPARATION.md name the package.
  Tests: test/silinx-hdl-package.test.js covers the 43 old paths, which export the names and values of the moved
  modules, and a design compiled, elaborated, simulated and written as flat Verilog through both paths. The
  repository's HDL files and the design and Yosys corpora (1024 files, 178 folders) give the same diagnostics,
  elaborated designs, flat Verilog and simulations as main's modules, through core/'s old paths and through the
  package. No behaviour change.
