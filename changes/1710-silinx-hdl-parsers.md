In detail:

- **The HDL front end's package, silinx-hdl, first part (#1710):** step 2 of the front end as a package
  (docs/TOOLCHAIN-SEPARATION.md section 5). packages/silinx-hdl/, an npm workspace of this repository (private until it
  is published, #1711; its own version, 0.1.0; Apache-2.0: its LICENSE, README, CHANGELOG and changes/, named in
  NOTICE), and its first 24 modules moved into packages/silinx-hdl/src as they are: the VHDL parser (core/vhdl/), the
  Verilog parser (core/verilog/), core/util.js and the UNISIM models (core/unisim.js, unisim-s6.js, unisim-jtag.js).
  Each old path in core/ re-exports its module, so their importers (core/, server/, web/js, scripts/, research/, the
  tests) are unchanged. The server serves the package's code to the browser (/packages/silinx-hdl/src; the standalone
  build bundles it, the release zip has it); the code-size, i18n and HDL boundary tests read the package (the
  boundary follows core/'s re-exports into it); the related tests follow a change of the package through core/'s old
  paths and run the HDL boundary's test (scripts/related-tests.mjs). Tests: test/silinx-hdl-package.test.js (the
  package; every old path's names and values those of the moved module), server-api (the package served), the
  fragments', related-tests and release tests. Checked on the repository's HDL files and the design and Yosys corpora
  (1024 files, 178 folders): the same diagnostics, elaborated designs, flat Verilog and simulations as main's modules.
  No behaviour change.
