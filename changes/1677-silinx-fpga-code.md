In detail:

- **The toolchain's code in its package (#1677):** the third part of step 6 of the toolchain's separation (#1651,
  docs/TOOLCHAIN-SEPARATION.md). The toolchain's 75 modules (core/fpga/, Spartan-6 included, and core/'s synthesis,
  flow, formats and parts: synth-open*, open-flow-core, open-flow-reports, open-steps, xdl, ucf, resources,
  resource-check, family, power, carry-chain, synth-fsm, lut-resynth) move as they are into packages/silinx-fpga/src/.
  Each old path in core/ re-exports its module, so their importers (server/, web/js, scripts/, research/, the tests)
  are unchanged; core/synth-open.js and core/open-flow-core.js also give the IDE's synthesizeOpen and runOpenFlow, so
  the package imports nothing of the IDE (test/toolchain-boundary.test.js, its list now empty). The server serves the
  package's code to the browser (/packages/silinx-fpga/src); the related tests follow a change of the package through
  core/'s re-exports (scripts/related-tests.mjs); the code-size and layering tests measure the package too. Tests:
  test/silinx-fpga-package.test.js (every old path's names and values those of the moved module, as on main). No
  behaviour change.
