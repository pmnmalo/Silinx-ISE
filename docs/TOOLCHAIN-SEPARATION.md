# Separating the Silinx toolchain from the IDE

The plan for [#1651](https://github.com/pmnmalo/Silinx-ISE/issues/1651): the Silinx toolchain (Yosys in
WebAssembly, then Silinx's pack, place, route, timing, DRC and bitgen, with the device data) becomes a
package that works without the IDE, as a library and a command line, and the IDE uses it like any other user.
This document is the analysis (October 2026, version 15.18.4) and the steps, each an issue of its own. No code
has moved yet.

## 1. What the toolchain is

The flow is `runOpenFlow(spec, io)` in `packages/silinx-fpga/src/open-flow-core.js`. It already runs the same way in Node
(`server/open-flow-run.js`, a process of its own, files on disk) and in the browser
(`web/js/open-flow-worker.js`, a Web Worker, files in memory): everything outside the flow comes through
`io` (the sources, the UCF, the device, the bit database, Yosys, the files written). That interface is where the
separation starts.

### The modules

| Part | Files | Lines | KB | Tests that cover it |
|---|---|---|---|---|
| Netlist (Yosys JSON in) `packages/silinx-fpga/src/fpga/netlist.js` | 1 | 128 | 6 | `packages/silinx-fpga/test/fpga-netlist.test.js`, `test/ucf.test.js` |
| Pack `packages/silinx-fpga/src/fpga/pack.js`, `pack-*.js` | 14 | 2024 | 118 | `packages/silinx-fpga/test/fpga-pack.test.js`, `packages/silinx-fpga/test/pack-parts.test.js`, `test/iob-*.test.js` |
| Place `packages/silinx-fpga/src/fpga/place.js`, `place-*.js`, `replicate.js` | 10 | 1690 | 105 | `packages/silinx-fpga/test/fpga-place.test.js`, `packages/silinx-fpga/test/place-parts.test.js`, `test/fpga-replicate.test.js`, `packages/silinx-fpga/test/fpga-hard.test.js` |
| Route `packages/silinx-fpga/src/fpga/route.js`, `route-*.js` | 5 | 1069 | 59 | `packages/silinx-fpga/test/fpga-route.test.js`, `packages/silinx-fpga/test/route-parts.test.js`, `test/fpga-place-route.test.js` |
| Timing (trce-like) `packages/silinx-fpga/src/fpga/timing.js`, `timing-*.js` | 3 | 1226 | 72 | `test/fpga-timing.test.js`, `packages/silinx-fpga/test/timing-parts.test.js` |
| Bitstream and bit database `packages/silinx-fpga/src/fpga/bitgen.js`, `bitstream.js`, `bitdb.js`, `bitdb-node.js`, `lut.js` | 5 | 1030 | 59 | `packages/silinx-fpga/test/fpga-bitgen.test.js`, `packages/silinx-fpga/test/fpga-bitstream.test.js`, `packages/silinx-fpga/test/fpga-lut.test.js`, `packages/silinx-fpga/test/s3e-devices.test.js` |
| Device description `packages/silinx-fpga/src/fpga/device.js`, `device-node.js` | 2 | 545 | 28 | `packages/silinx-fpga/test/fpga-device.test.js`, `test/s3e-device.test.js`, `test/open-toolchain.test.js` |
| Spartan-6 (in development, #1) `packages/silinx-fpga/src/fpga/s6/` | 15 | 2475 | 140 | `test/s6-*.test.js` |
| Synthesis (Yosys WASM, FSM, carry chains, LUT resynthesis) `core/synth-open*.js`, `packages/silinx-fpga/src/carry-chain.js`, `packages/silinx-fpga/src/synth-fsm.js`, `packages/silinx-fpga/src/lut-resynth.js` | 9 | 2610 | 164 | `test/synth-open*.test.js`, `test/synth-fsm.test.js`, `test/synth-abc9.test.js`, `test/carry-*.test.js`, `test/lut-resynth.test.js`, `test/yosys-*.test.js` |
| The flow and its reports `packages/silinx-fpga/src/open-flow-core.js`, `open-flow-models.js`, `open-flow-reports.js`, `open-steps.js` | 4 | 633 | 45 | `test/open-flow*.test.js`, `test/open-steps.test.js` |
| Formats `packages/silinx-fpga/src/xdl.js`, `packages/silinx-fpga/src/ucf.js` | 2 | 1029 | 55 | `test/xdl.test.js`, `test/ucf.test.js` |
| Parts and resources `packages/silinx-fpga/src/resources.js`, `resource-check.js`, `family.js`, `power.js` | 4 | 764 | 46 | `test/resources.test.js`, `test/resource-check.test.js`, `test/power.test.js` |

About 75 files and 15 700 lines, 64 unit test files. The routing graphs are checked against ISE by DRC; the DRC
is ISE's (the oracle), the toolchain's own checks are `checkRouting` (`packages/silinx-fpga/src/fpga/route.js`) and the resource
check.

Around it, outside the toolchain: the technology view (`core/fpga/techview.js`, which draws with the schematic
model and elkjs: it belongs to the IDE although it lives in `core/fpga/`), the UI tests
(`test/ui/open-toolchain.test.js`, `test/ui/synth-open.test.js`, `test/ui/summary.test.js`,
`test/ui/fpgaview.test.js`), and the corpora: the design corpus (`test/designs-corpus/run.mjs`,
`test/designs-corpus.test.js`), the Yosys test designs (`test/corpus/`).

### The oracle and the workflows

- `npm run check:open-flow` (`scripts/check-open-flow.mjs`): the open flow's `.bit` against ISE's, byte for
  byte, and ISE's DRC; it runs the research command line `packages/silinx-fpga/research/s3e-route/open-flow.mjs`.
- The ISE workflow (nightly, `ise.yml`) and the quality comparison (weekly, `quality.yml`,
  `test/designs-corpus/compare-ise.mjs`) on the self-hosted runner.
- The Yosys update (`yosys-update.yml`, `scripts/yosys-update-report.mjs`): the open flow's size and speed with
  the new Yosys against the base's.
- The research that builds the data: `packages/silinx-fpga/research/s3e-bitstream/` (the bit database), `packages/silinx-fpga/research/s3e-device/` and
  `packages/silinx-fpga/research/s3e-route/build-device.mjs` (the device descriptions), `research/s6/`. They import the toolchain;
  the application never imports research (`test/layering.test.js`, #407).

### The data

| Data | Where | Size |
|---|---|---|
| Routing graphs, Spartan-3E (4 parts) | `packages/silinx-fpga/devices/*.json.gz` | 8.3 MB |
| Routing graphs, Spartan-6 (2 parts) | `packages/silinx-fpga/devices/*.json.gz` | 4.3 MB |
| Bit database (Spartan-3E) | `packages/silinx-fpga/bitdb/` (22 files) | 4.9 MB |
| Yosys in WebAssembly | `@yowasp/yosys` (npm, pinned) | 76 MB installed, 69 MB of it `yosys.core.wasm` |

The graphs ship for the supported parts only; other parts are built by each user from their own ISE
(`~/.silinx/devices`). No ISE file or raw output is in the repository, and none will be in the package.

## 2. The coupling

### What the toolchain imports from the rest of core/

| Import | From | What it is | Plan |
|---|---|---|---|
| `core/compile.js` (parsers, elaborator) and `core/unisim.js` (`primitiveSources`) | `open-flow-core.js`, `open-flow-models.js` | the HDL front end: VHDL / Verilog to the elaborated design | a hook the IDE gives the flow (step 4) |
| `core/synth-verilog.js` (`toVerilog`), and `gateAssignments` on the elaborated design | `synth-open.js` | the elaborated design as one flat Verilog module for Yosys | split: the front end gives the flat Verilog, the toolchain synthesises it (step 3) |
| `core/sim-model.js` (and through it `sdf.js`, `netlist-hier.js`, the simulator) | `open-flow-models.js` | the post-synthesis / post-PAR simulation models (netgen) | a hook (step 4) |
| `core/schdoc.js`, `core/netlist-hier.js`, elkjs | `core/fpga/techview.js` | the technology view | the view leaves `core/fpga/` (step 2) |

Transitively these few imports pull in 60 other modules of `core/` (19 000 lines: the VHDL and Verilog parsers,
the elaborator, the interpreter, the schematic model). Cut at those four places, the toolchain imports nothing
from the IDE. It imports neither `core/version.js` nor `core/third-party.js` nor the i18n.

### What imports the toolchain

- **server/**: `open-flow.js` (the processes, the devices, the bit database), `open-flow-run.js` (the flow's
  process), `impl-routes.js` (the FPGA view's data), and `devices.js`, `ise.js`, `programmer.js`,
  `projects.js`, `xise.js` (for `packages/silinx-fpga/src/family.js`, `packages/silinx-fpga/src/ucf.js`, `packages/silinx-fpga/src/resources.js`); `bin/silinx-ise.js`
  (its `ucf` command).
- **web/js** (by absolute URL, `/core/…`, served by `server/server.js`, bundled by the standalone build):
  `open-flow-worker.js` (the flow, the device, the bit database, Yosys), `open-flow-browser.js`,
  `yosys-worker.js`, `summary.js`, `fpgaview-details.js`, `pinplanner.js`, `pins-check.js`, the wizards and
  `device-change.js` (resources, UCF, families), `api-local.js` (XDL).
- **core/** (the IDE's): `sim-model.js` (timing, netlist, techview), `auto-pins.js` and `adept.js` (UCF,
  families), `primitives.js`, `prim-templates.js`, `symdocs.js` (resources).
- **scripts/**: `measure-power.mjs`; `build-standalone.mjs` (the data's paths); `check-open-flow.mjs`.
- **The HLS flow** goes through the HDL it generates and the project's processes: it imports no toolchain
  module.
- **Tests**: 99 test files import the toolchain directly, 88 of them unit tests; research: 89 scripts.

### The shared helpers

- **Go with the toolchain, the IDE imports them from it**: `packages/silinx-fpga/src/xdl.js` and `packages/silinx-fpga/src/ucf.js` (formats),
  `packages/silinx-fpga/src/resources.js` and `packages/silinx-fpga/src/family.js` (the parts' resources and families: the toolchain's data, used by
  the IDE's palettes and wizards), `packages/silinx-fpga/src/open-steps.js` (the steps' names).
- **Stay in the IDE**: the HDL front end, `core/unisim.js`, `core/sim-model.js`, `core/sdf.js`,
  `core/netlist-hier.js`, the technology view, the i18n, the version.
- **A contract to keep**: the flow's log lines and warnings are English; the IDE translates some of them
  (`web/js/i18n.js`) and its tests assert them. A changed message is then a change of the package's API.

### Licence and notices

Everything is AGPL-3.0-only with the elkjs permission, copyright Pedro Maló, and Pedro is the only author of
the code (the bots' commits are dependency updates). The toolchain does not use elkjs (only the technology
view does, which stays in the IDE), so the elkjs permission is not needed for the package. Its one third-party
component is Yosys (YoWASP, ISC, with Yosys's own dependencies' notices). The package needs a NOTICE and a
THIRD-PARTY-NOTICES of its own; the IDE's keep listing Yosys while it bundles it in the standalone edition.
The bit database and the routing graphs are facts measured by observation (`docs/OPEN-TOOLCHAIN.md`): their
licence could have been another than the code's (Project X-Ray publishes its database under CC0); the
package's licence, the data's included, is decided in section 4.

## 3. How to separate it

### The options

| | A separate repository now | A package in this repository (npm workspace) | git subtree |
|---|---|---|---|
| The boundary | enforced by the repositories | enforced by a test (no import of internals) and the package's own `package.json` | as a separate repository |
| A toolchain fix | a PR there, a release, a version update here (Dependabot): 3 steps | one PR | a PR here, then a subtree push |
| related-tests, the release CI | duplicated; a change of both needs two runs | unchanged (the package's tests are files of this repository) | as today here, a second CI there |
| Pages, the standalone build, the release zip | the assets from the npm package | the assets from the package's folder (each tag's build reads its own paths) | as today |
| Dependabot, the Yosys update | Yosys's PRs go there; the comparison moves there | unchanged (one lock file; the workflow reads the package's `package.json`) | duplicated |
| The ISE oracle on the self-hosted runner | a second runner registration (a user's repository has per-repository runners) and its window (#482) | unchanged | duplicated |
| The device graphs | in the npm package (12 MB) | in the package's folder | in both |
| History | kept with `git filter-repo` | kept (`git mv`) | duplicated, and merges in a linear-history `main` |

### Recommendation

**First a package in this repository (an npm workspace), then, when its API is stable, its own repository.**
The workspace is the necessary first half of #1651 anyway: the boundary, the API, the command line and the
moved tests have to exist before a repository of its own can work. It costs nothing to CI, Pages, the runner
or the release, while the synthesis-quality and Spartan-6 work goes on in `core/fpga/` every day. The second
half (filter-repo into a new repository, its CI, runner and releases; the IDE then depends on the published
version) is #1651 itself, decided when the package has been stable for a while. git subtree is not
recommended: it duplicates everything and does not fit a protected `main` with a linear history.

### The steps

Each step is a pull request (or a few) that changes no behaviour, as CLAUDE.md's splitting rules (#405) ask:
the code moves as it is, the old modules re-export what moved, the importers stay as they are until the step
that changes them, the moved modules are checked against `main`'s on the corpus. Steps 1 to 5 change nothing
in the layout and can start now; the decisions steps 6 and 10 needed are taken (section 4).

1. **A boundary test** ([#1672](https://github.com/pmnmalo/Silinx-ISE/issues/1672)): the toolchain's
   modules, and the modules of the IDE they may import today (the four above), listed in a test; a new import
   across fails, and the list only shrinks (as `test/code-size.test.js`). Done: `test/toolchain-boundary.test.js`.
2. **The technology view out of `core/fpga/`** ([#1673](https://github.com/pmnmalo/Silinx-ISE/issues/1673)):
   `core/fpga/techview.js` moves to `core/`, the old path re-exporting. Done: `core/techview.js`.
3. **Synthesis from flat Verilog** ([#1674](https://github.com/pmnmalo/Silinx-ISE/issues/1674)):
   `synthesizeOpen(design)` becomes the front end (`toVerilog`, the gate count) followed by a synthesis of the
   flat Verilog; `synthesizeOpen` keeps its signature. The same netlists on the corpus. Done: `core/synth-front.js`
   (`synthesisInput`, `synthesizeOpen`) and `synthesizeVerilog` in `packages/silinx-fpga/src/synth-open.js`.
4. **The flow's front end and simulation models as hooks**
   ([#1675](https://github.com/pmnmalo/Silinx-ISE/issues/1675)): `runOpenFlow` gets the HDL front end and the
   simulation models through `io`; a wrapper in the IDE gives them, so `server/open-flow-run.js` and
   `web/js/open-flow-worker.js` run as before. After it the boundary test's list is empty. Done: `runFlow` with
   `io.frontEnd` and `io.simModels`; `core/flow-ide.js` `runOpenFlow` gives the IDE's (`core/synth-front.js`
   `flowFrontEnd`, `core/flow-models.js`, moved from `open-flow-models.js`); the list keeps only the old
   paths' re-exports, which go with step 7.
5. **The bit database out of research/** ([#1676](https://github.com/pmnmalo/Silinx-ISE/issues/1676)): the
   data the application ships moves next to the graphs; research re-exports its path (`test/layering.test.js`);
   the standalone build and the related tests' data map (#772) follow. Done: `packages/silinx-fpga/bitdb/`.
6. **The workspace package** ([#1677](https://github.com/pmnmalo/Silinx-ISE/issues/1677)): `packages/silinx-fpga/`
   with its `package.json` (private until step 10) and its Apache-2.0 LICENSE, the root's `workspaces`; `core/fpga/` (the
   Spartan-6 part, the graphs and the bit database included) and the toolchain's modules of `core/` move there
   as they are, in a few PRs; every old path re-exports, the server serves the package to the browser, the
   standalone build and the release zip take it. Done in agreement with the sessions working in `core/fpga/`
   (a move conflicts with every open change there). Started: `packages/silinx-fpga/` with its
   `package.json` and LICENSE, then its data (`devices/`, `bitdb/`), then the toolchain's 75 modules (`src/`, `core/`'s
   old paths re-exporting them; the boundary test's list empty).
7. **The public API** ([#1678](https://github.com/pmnmalo/Silinx-ISE/issues/1678)): the package's entry
   (`exports`): netlist and UCF in, `.bit`, XDL and the reports out, the devices and bit databases, the flow
   with its `io`; the IDE's importers switch to it, the re-exporting shims go, and the boundary test then says
   that the IDE imports nothing but the API. Started: the entries `silinx-fpga` (`src/index.js`, Node and the
   browser) and `silinx-fpga/node` (the disk's loaders, Yosys in Node), documented in the package's README; the
   flow places and routes through `io.placeRoute` when given (nextpnr: #1953, #1954). Done: the light entry
   `silinx-fpga/parts` for the IDE's pages; the IDE imports the entries only (`test/toolchain-boundary.test.js`),
   the tests and the research the package's modules; `core/`'s old paths are gone. The IDE and the server reach
   the package by its path (the release zip has no workspace link, #1677), so `scripts/related-tests.mjs` follows
   the imports as before.
8. **The command line** ([#1679](https://github.com/pmnmalo/Silinx-ISE/issues/1679)): `silinx-fpga build`,
   from `packages/silinx-fpga/research/s3e-route/open-flow.mjs`, and a README with a blinky for the Basys2. A new feature with its
   tests. Done: `packages/silinx-fpga/bin/silinx-fpga.js` (`src/cli.js`): Verilog or a Yosys JSON netlist and a UCF
   to the `.bit`, through `runFlow`; the Verilog checked by Yosys first, file by file (the flow has no front end to
   say where an error is); the README's blinky byte for byte the IDE's `.bit` (`test/silinx-fpga-cli.test.js`).
9. **Its tests, oracle and research with it** ([#1680](https://github.com/pmnmalo/Silinx-ISE/issues/1680)):
   the 64 unit test files, `check:open-flow`, the data-building research; the test globs, the shards,
   related-tests and the workflows (ISE, Quality, Yosys update) follow.
   Started: of the 101 test files that import the toolchain, the 16 that import the package alone, its simulators
   of a packed design (`fpga-sim.js`) and its fixtures (`fixtures/fpga`) are in `packages/silinx-fpga/test`
   (`npm test` in the package); the shards, the timings and the related tests know the folder. Most of the others
   make their designs with the IDE's front end, and stay the IDE's integration tests (or follow with
   `silinx-hdl`); those of the research move with it, at a time agreed with the sessions working there.
   Second part: the Spartan-3E research (`s3e-device`, `s3e-bitstream`, `s3e-place`, `s3e-route`) and the
   nextpnr spike (`nextpnr-s3e`) are in `packages/silinx-fpga/research`, and the five tests that then import
   the package alone (`fpga-bitgen`, `iob-reg`, `s3e-bitstream-tools`, `s3e-devices`, `nextpnr-s3e`) in its
   `test/`. `research/s6` follows when the Spartan-6 work settles. `open-flow.mjs` and `check:open-flow` still
   make their designs with the IDE's front end (`core/compile.js`, `core/synth-front.js`): they stay the IDE's
   until the front end is a package of its own (`silinx-hdl`).
10. **Licence, notices, versioning and publishing**
    ([#1681](https://github.com/pmnmalo/Silinx-ISE/issues/1681)): as decided (section 4): the package's NOTICE
    and THIRD-PARTY-NOTICES, the IDE's NOTICE naming it, its changelog fragments and 0.x version, a publishing
    workflow from its own tag in this repository.
11. **Its own repository** ([#1651](https://github.com/pmnmalo/Silinx-ISE/issues/1651)): `silinx-fpga` moves
    to a GitHub repository of its own (decided, section 4), once steps 1 to 10 are done: `git filter-repo` keeps
    the moved files' history; there, its CI, the ISE oracle (the self-hosted runner registered for it too), CodeQL,
    Dependabot and the Yosys update, its releases and npm publishing; here, the IDE depends on the published
    version (updated by Dependabot) and the package's folder goes.

## 4. Decided

Pedro's decisions (27 October 2026):

- **The name**: `silinx-fpga`, for the package (unscoped: no npm organisation needed; the name was free on
  npm) and for its repository; its command line is `silinx-fpga`.
- **Its own GitHub repository**: yes, after the workspace stage: steps 1 to 10 here, then the move (step 11).
- **The licence**: Apache-2.0, for the code and the data alike (the bit database, the device graphs): one
  LICENSE for the whole package. Pedro, the only author, relicenses the moved code; the IDE stays
  AGPL-3.0-only with the elkjs permission, and Apache-2.0 code may be part of an AGPL-3.0 work. The IDE's
  NOTICE then names `silinx-fpga` (Apache-2.0) among its components, and the package has its own NOTICE
  (Apache-2.0's) and THIRD-PARTY-NOTICES (Yosys / YoWASP, ISC).
- **npm publishing**: from this repository while the package lives here, then from its own; from a tag of its own (for example `silinx-fpga-v0.1.0`), with
  provenance, once its tests have passed on that commit; the package carries the graphs and the bit database
  (17 MB) and depends on `@yowasp/yosys`.
- **Versioning**: its own semver, 0.x until the API is stable, with its own changelog (its own fragments).
- **The front end**: the package takes flat Verilog or a Yosys netlist (JSON); VHDL stays the IDE's, whose
  front end gives the package flat Verilog. The front end becomes a package of its own, `silinx-hdl`, which
  stays in this repository (section 5).

So step 6 no longer waits, and step 10 can follow it at once: the package's LICENSE comes with its folder,
its publishing when the API (step 7) is in place.

## 5. VHDL: the front end in front of the package

Yosys in WebAssembly reads Verilog only (YoWASP has no GHDL plugin), so VHDL is read by Silinx's own front end,
as today, and the package never sees it:

```
VHDL / Verilog ─▶ Silinx front end (the IDE) ─▶ flat Verilog ─▶ silinx-fpga ─▶ .bit, reports
                 compile, elaborate, toVerilog                   Yosys, pack, place, route, bitgen
```

- **The front end** is `core/compile.js` (the VHDL and Verilog parsers, the elaborator), `core/unisim.js` (the
  UNISIM primitives' sources) and `core/synth-verilog.js` with its `synth-*.js` (the elaborated design as one
  flat Verilog module): 39 modules, about 12 600 lines, with the interpreter and `core/values.js` for the
  constant expressions. It reads VHDL and Verilog alike, so a Verilog design goes through it too in the IDE, as
  today (the same netlists, the same warnings).
- **Steps 3 and 4 make the joint**: the front end's output (the flat Verilog, its top, its warnings, the gate
  count for the carry chains, the shift arrays) becomes the package's synthesis input, and `runOpenFlow` gets
  the front end as a hook of `io`. The IDE's wrapper gives Silinx's front end, in Node and in the browser;
  `silinx-fpga` alone reads Verilog or a Yosys netlist. The gate count and the shift arrays become optional
  hints of the input, so plain Verilog from another tool synthesises too.
- **The command line** (step 8) takes Verilog, and VHDL through `silinx-hdl` when it is installed (below).

### silinx-hdl: the front end as a package of this repository

Decided (27 October 2026): the front end becomes **`silinx-hdl`**, a package of this repository (an npm
workspace) that stays here when `silinx-fpga` leaves; Apache-2.0, as `silinx-fpga`; published to npm from this
repository with its own semver (the name was free on npm). The IDE (Silinx ISE) is then the editors, the
drawings, the simulation, HLS, ISE and the board around the two packages, and `silinx-fpga` never depends on
`silinx-hdl` (an optional peer dependency of its command line):

```
silinx-hdl (this repository)      silinx-fpga (its own repository)
VHDL / Verilog ─▶ flat Verilog ─▶ Yosys, pack, place, route, bitgen ─▶ .bit, reports
        ▲                                     ▲
        └──── Silinx ISE (the IDE) uses both ─┘
```

The front end imports nothing else of the IDE today (its 39 modules include the interpreter and the event
simulator that `compile` uses), so its steps are the toolchain's, shorter:

1. **A boundary test** ([#1709](https://github.com/pmnmalo/Silinx-ISE/issues/1709)): its modules listed, no
   import from them into the rest of the IDE. Done: `test/hdl-boundary.test.js`.
2. **The workspace package** ([#1710](https://github.com/pmnmalo/Silinx-ISE/issues/1710)):
   `packages/silinx-hdl/`, the modules moved as they are, the old paths re-exporting; after the toolchain's
   workspace (step 6, #1677), which sets the workspaces up.
3. **Its API and publishing** ([#1711](https://github.com/pmnmalo/Silinx-ISE/issues/1711)): `compile`,
   `elaborate`, the flat Verilog with its hints, the UNISIM sources; the IDE's importers switch to it; its
   publishing from its own tag; VHDL in `silinx-fpga`'s command line through it.
