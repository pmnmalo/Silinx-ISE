# Replacing the shipped XC3S250E graph with the measured one: the plan (#3)

A plan for review, not the change: what replacing `packages/silinx-fpga/devices/xc3s250ecp132-4.json.gz` (computed from ISE's
`xdl -report`) with the measured description (README sections 9-14) would change in the repository, its tests and its
documentation, in what order, and what is still open. Nothing here is decided; the decision is the maintainer's.

## Where it stands (2026-10-25)

| | The measured graph (chip32) |
|---|---|
| Built from | ISE's routed designs (178), the arc probe (`xdl -xdl2ncd`), the DRC join tests (37 rounds), the bit database, the device report's grid and sites; the shipped graph used for scoring only |
| Size | 0.75 MB (the shipped: 1.96 MB) |
| Nodes | 0 merged; 3413 split, **none with two pieces a net can reach** (no short), 478 costing a route |
| Pins | 0 wrong; the missing ones none the open flow uses, but 216 BCIN wires named as the pin (their nodes right) |
| Rules (`PINRULES`) | 64 pins, 125 joins: checked by ISE only where a route uses them |
| ISE's verdict | the 43 XC3S250E designs (7 examples, 36 `test/fixtures/open-flow`): DRC 0 / 0, no warning, `.bit` byte-identical (CRC on and off) |
| Speed (ISE's `trce`) | geometric mean 0.9960 of the shipped graph's period (22 within 0.5%, 10 faster, 5 slower) |

## A dry run of the tests

The measured graph in the shipped file's place (and in `SILINX_CONFIG_DIR`, which `~/.silinx/devices` would otherwise
win over), 28 test files of the open flow and the devices run (`node --test`, one file at a time), the file restored
after: **457 tests pass, 8 fail**, in five kinds (rerun on 2026-10-26 after README section 15: the two measured, **5
fail**, all of them tests pinned to the shipped graph):

| Test | Why | What to do |
|---|---|---|
| `fpga-hard`: DCM outputs CLK2X180 / CLKFX180 / CLK90 on every device; two DCMs on each device (2) | the pad the placer gives a DCM's CLKIN: B9 where ISE gives A9 — pad A9's dedicated path to DCM_X1Y1 missing (no design had taken A9 as a clock input) | **done** (README section 15, #1522): measured with ISE (`gen-obspins2.mjs dcmpads`); the tests pass |
| `iob-pair-clocks`: the pads of a differential pair, the tile's third IOB (1) | an input-only pad's OTCLK1 / OTCLK2 missing (`null.wire`): no design can drive them | **done** (README section 15, #1522): a rule, the clock pins on `<pin><k>` of the I pin's `Ik_PINWIRE`; the test passes |
| `fpga-place-route`: the polish of the critical path (#662, #651) (2) | the tests pin a routing that is congested in a given way on the shipped graph | re-pin on the measured graph (the same property, other nets), or keep these tests on a fixture graph |
| `fpga-timing` #601: a DCM's clocks against trce on routed designs (1) | its routed designs and trce reports were made on the shipped graph's routes | re-record them with ISE on the measured graph (the Mac mini) |
| `s3e-devices` #74 (`absent`); `s3e-bitstream-tools` want-pips (2) | they read the shipped graph's contents: the PIPs a type's features offer that some tiles lack (the measured graph has none of them: the probe refused them), a count of 18204 PIPs (18206) | read them from the bit database's own measurements, or from a fixed copy of ISE's description kept for the research tools (see below) |

The 22 other files (341 tests: the open flow on every fixture, the examples, the block RAMs, the clocks, power, the
corpus, the CLI, the browser flow) pass unchanged. The UI tests and the other 41 files that load the XC3S250E were not
run: the full CI run by hand comes before any merge (below).

## What changes in the repository

1. **The measurements, in the repository**, so the graph can be rebuilt and checked: the observation (`obs.json`), the
   verdicts of the join and clock tests, the probes' results, the switch tiles, and the command that builds the graph
   from them (`chip.mjs` with its options, sections 9-14). Some 20-40 MB uncompressed, a few MB gzipped: under
   `research/s3e-device/data/xc3s250e/` (measured on 2026-10-26: 79 MB of JSON, 6.8 MB gzipped, 3.8 MB with xz). A
   unit test rebuilds the graph and compares it with the shipped file (byte for
   byte, as `test/s3e-devices.test.js` does for the other graphs' descriptions).
2. **`packages/silinx-fpga/devices/xc3s250ecp132-4.json.gz`** replaced by the rebuilt graph; the shipped one of before kept only in
   git's history (or, for the research tools that measure against ISE's description — `pip-exceptions.mjs`,
   `prototype.mjs compare` —, as `research/s3e-device/data/xc3s250e/ise-report.json.gz`: a decision, as it is
   the one file computed from `xdl -report`).
3. **The tests** of the table above: measure what is missing (the clock pads' paths, the third IOB's pins), re-pin
   the routing tests, re-record #601's trce, and move #74 / want-pips to the bit database or the kept ISE description.
4. **The documentation:**
   - `packages/silinx-fpga/devices/README.md`: the XC3S250E's graph measured (how, its gaps: the split nodes that cost a route, the
     rules, the BCIN names), the other three still computed from `xdl -report`;
   - `docs/OPEN-TOOLCHAIN.md`: where the device descriptions come from; a user's own ISE still builds a description of
     its own, which takes precedence (`~/.silinx/devices`, unchanged);
   - the comments that say where the graph comes from: `core/fpga/device-node.js`, `server/open-flow.js`,
     `web/js/open-flow-browser.js`, `scripts/build-standalone.mjs`, `core/resources.js`,
     `research/s3e-bitstream/pip-exceptions.mjs`;
   - `NOTICE` / `THIRD-PARTY-NOTICES`: unchanged (no dependency), unless the maintainer wants the measured graph's
     provenance stated there;
   - the changelog fragment: "In short" (the Basys2-250's description measured with ISE alone), "In detail".
5. **Nothing in the code paths:** the loader, the placer, the router, bitgen and the browser read the file as they do
   now (the same packed format, the device's grid since section 13). The browser's and the standalone build's asset
   caches take the new file with the release's version (`assets/<version>/devices/`), as any change of a graph.

## In what order

1. A pull request with the measurements and the rebuild test (no change of behaviour).
2. The measurements still missing: the clock pads' dedicated paths and the input-only pads' clock pins are done (README
   section 15); the 477 split nodes that cost a route, if wanted (`research/s3e-device`, its rounds on the Mac mini).
3. A pull request with the swap, the tests of the table and the documentation; before it merges:
   - the full CI by hand on its branch (Actions ▸ CI ▸ Run workflow): the unit tests on the three systems, the UI tests
     in both interfaces, Firefox / WebKit, the standalone build;
   - the ISE checks (the nightly's `check-open-flow` on the examples and fixtures; the 43 of section 13 again);
   - the quality comparison (Actions ▸ Quality) against the last run on the shipped graph.
4. A release note; the Basys2-250's users notice nothing but, perhaps, slightly different placements and speeds.

## Still open, the maintainer's call

- Whether 478 split nodes that cost a route are acceptable (no short; fewer choices: section 14 lists them).
- Whether rules (64 pins, 125 joins) may stand in a shipped description, ISE checking them only where routes use them.
- Whether the description computed from `xdl -report` is kept for the research tools, or only in git's history.
- The other three devices (XC3S100E, XC3S500E, XC3S1200E): measured the same way later, or kept as they are.
