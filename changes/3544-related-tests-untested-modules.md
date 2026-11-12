In detail:

- **A pull request's tests of a module no test imports (#3544):** scripts/related-tests.mjs follows a changed module
  that no unit test (nor a helper of the tests) imports up through its importers, at most four levels
  (`UNTESTED_DEPTH`), to the modules the tests import, and runs their tests: a change of core/translate-to-verilog.js
  runs translate.test.js and the deep-* tests (21 files with the repository's checks, before 13), core/cpp-tb-parse.js
  the C++ tests (22, before 13), core/c-dataflow.js the HLS's (107, before 12), packages/silinx-hdl/src/vhdl/purity.js
  the elaboration's (20, before 13); a module a test imports, through core/'s old path too, keeps its own tests (core/
  schdoc.js 86, core/compile.js 296, as before). The web/ pages are not followed (their UI tests are by name).
  test/related-tests.test.js: the climb, its bound, a helper, the repository's modules of the audit.
