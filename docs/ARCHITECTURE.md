# Silinx's architecture

How Silinx ISE is built, as a whole: the editions, the layers, and each part with its files and the documents that go
deeper. For the toolchain alone (from a design to a `.bit`), read [TOOLCHAIN.md](TOOLCHAIN.md); for where to start
changing the code, [ONBOARDING.md](../ONBOARDING.md); for the rules, [CLAUDE.md](../CLAUDE.md).

## One program, two hosts

Silinx is one web application. The same pages and the same `core/` modules run in two hosts:

| Edition | Host | The projects | Runs ISE | Programs the board |
|---|---|---|---|---|
| **Local server** (`npm start`, `bin/silinx-ise.js serve`) | Node: `server/server.js` serves the pages and a REST API | Folders on disk, `~/Silinx-projects` ([PROJECT.md](PROJECT.md)) | Yes (Docker, SSH or native: `server/toolchain.js`) | Through local tools (`server/programmer.js`) or WebUSB |
| **Browser edition**: one file (`dist/Silinx-ISE.html`) and the site, installable as an app | The browser alone: no server | The browser's storage or a folder the user picks (`web/js/project-store.js`) | No | WebUSB (`core/adept.js`, `core/xcf.js`) |

The interface does not know which host it has: it talks to `web/js/api.js` (the server's REST API) or `web/js/api-local.js`
(the same interface, in the browser). `scripts/build-standalone.mjs` bundles the pages, `core/`, the examples and the
WebAssembly tools into the single file; `scripts/pwa.mjs` adds the site's service worker (`web/js/sw.js`).

## The layers

```text
 The interface    web/js/   two interfaces (modern, classic); the Design pane, the editors, the processes,
                            SSim, the Board Emulator, the pin planner, iMPACT, the FPGA view; Portuguese
                     │ api.js (the server) │ api-local.js (the browser)
 The hosts        server/   projects on disk, jobs, ISE's flow, the Silinx flow in a process, programmers, MCP
                  browser   projects in its storage, Web Workers (Yosys, the flow, the emulator)
                     │
 The core         core/     isomorphic (no DOM, no Node APIs): the HDL front end, the simulator, the drawings, Silinx
                            HLS, the emulator's engines, the simulation models, programming over WebUSB
                     │
 The toolchain    packages/silinx-fpga   synthesis to bitstream (TOOLCHAIN.md)
                     │
 Outside tools    Yosys and nextpnr (WebAssembly, npm) │ Xilinx ISE 14.7 (the user's) │ programmers (openFPGALoader…)
```

`core/` is the heart: everything a design is (its sources, its drawings, its meaning) is computed there, the same in
Node, in a page and in a Web Worker, and tested in Node.

## The parts

### The project and the Design pane

A project is a folder with `silinx.json`: its sources, its top, its device and board, its constraints, its properties
([PROJECT.md](PROJECT.md); `server/projects.js` on disk, `web/js/project-store.js` in the browser; `web/js/project.js`
opens and closes it). The Design pane shows one row per module: a drawing is the module's base and its HDL file is always
generated from it (CLAUDE.md). ISE's project files are read and written too (`server/xise.js`, ISE's schematics:
`core/isesch.js`).

### The drawings

Each kind of drawing has its model in `core/` and its editor in `web/js/`; `core/view-hdl.js` gives the HDL of any of
them, and `web/js/drawings.js` keeps a drawing and its HDL module in step.

| Drawing | Model | Editor |
|---|---|---|
| Schematic | `core/schdoc.js`; from HDL: `core/hdl-to-sch.js` | `web/js/sch-editor.js` |
| ASM chart | `core/asm.js`; from HDL: `core/asm-from-hdl.js` | `web/js/asm-editor.js` |
| State diagram (FSM) | `core/fsm.js` | `web/js/fsm-editor.js` |
| Truth table, Boolean algebra | `core/logic.js` | `web/js/truthtable.js` |
| Petri net | `core/petri.js` | `web/js/petri-editor.js` |
| Handwriting (expressions, tables, schematics) | `core/ink/` | `web/js/ink-dialog.js` and its siblings |

### The HDL front end

VHDL and Verilog are parsed into one intermediate representation (`core/vhdl/parser.js`, `core/verilog/parser.js`,
[IR.md](IR.md)), compiled into a library and elaborated into an instance hierarchy with bound, executable expressions
(`core/compile.js`, `core/elaborate.js`). On it: Check Syntax and the lint (`core/lint.js`, `core/lint-design.js`), quick
fixes and renames (`core/quickfix.js`, `core/rename.js`), the editor (`web/js/editor.js`, CodeMirror). For the synthesis,
the elaborated design is written as one flat Verilog module (`core/synth-verilog.js`, `core/synth-front.js`): the
toolchain receives that, and reads no VHDL itself.

### Simulation

- **The simulator**: event-driven, with delta cycles, VHDL and Verilog in one design (`core/simulator.js`,
  `core/interp.js`); its window is SSim, as ISim's (`web/js/isim.js`). The Test Bench Wizard writes self-checking test
  benches (`core/testbench.js`).
- **The simulation models** after each step, post-synthesis to post-route, from either flow (`core/flow-models.js`):
  netgen-style netlists of the device's primitives (`core/unisim.js`, evaluated natively by `core/native.js`) and, after
  routing, their delays (`core/sdf.js`).
- **The Board Emulator**: the design running on a picture of its board, its switches, buttons, LEDs, displays and VGA
  monitor (`core/emulate.js`, `web/js/emulator.js`), on a compiled cycle simulator (`core/compiled-sim.js`) in a Web
  Worker of its own (`web/js/emulator-worker.js`), or on the event-driven one.

### Implementation: two flows

The processes (`web/js/processes.js`, `web/js/implement.js`) run the project's flow, chosen in Toolchain Settings, and
the Design Summary (`web/js/summary.js`) shows its reports, as ISE's do:

- **The Silinx toolchain**, `packages/silinx-fpga`: Yosys, pack, place and route (Silinx's or nextpnr), timing,
  bitstream, with no Xilinx software. The server runs it in a process of its own (`server/open-flow.js`), the browser in
  a Web Worker (`web/js/open-flow-worker.js`), both through `core/flow-ide.js` (the toolchain with the IDE's front end
  and simulation models). Everything about it: [TOOLCHAIN.md](TOOLCHAIN.md).
- **Xilinx ISE 14.7**, which the user installs: XST, NGDBuild, MAP, PAR, TRCE, BitGen, run by `server/ise.js` in a
  Docker image, over SSH or natively (`server/toolchain.js`), as long jobs (`server/jobs.js`). Local server only.

ISE is also the open flow's oracle: the same routed design converted by ISE, a clean DRC and a byte-identical `.bit`
([OPEN-TOOLCHAIN.md](OPEN-TOOLCHAIN.md), [QUALITY.md](QUALITY.md)). The FPGA view (`web/js/fpgaview.js`) and the
technology view (`core/techview.js`) show the results.

### Silinx HLS

A C or C++ function as a design source: parsed (`core/c-parse.js`), scheduled against the clock (`core/c-schedule.js`)
and written as VHDL or Verilog with the ports Vitis HLS gives it; its C is its base, as a drawing is, and co-simulated
against its HDL (`core/c-cosim.js`). The other way, a design's C model (`core/hdl-c.js`). The source language, the
pragmas and how it is checked: [c-to-hdl.md](c-to-hdl.md).

### Constraints, boards and programming

The boards' pins, clocks and peripherals are in `server/boards.js`, the parts in `server/devices.js`; the pin planner
(`web/js/pinplanner.js`) and Check Constraints write the UCF. iMPACT's window (`web/js/impact.js`) programs the FPGA
and the board's Platform Flash: in the browser over WebUSB, with Silinx's own JTAG for the Digilent Adept boards
(`core/adept.js`, `core/xcf.js`); on the server, also through local programmers (`server/programmer.js`).

### The interface

- **Two interfaces** over the same page (`web/js/modern.js`): the modern one, the default, organised around a lab
  session's tasks (`web/js/tasks.js`), and the classic one, as ISE's. The UI tests run in both.
- **Portuguese**: every label has its translation (`web/js/i18n.js`), which a test checks.
- **Narrow screens and tablets**: `web/js/narrow.js`; the pen and touch work in the editors and the handwriting pads.
- **The messages** of every process in one console (`web/js/messages.js`).

### Around the application

- **The command line**: `bin/silinx-ise.js` (check, simulate, constraints, the toolchain's settings); the toolchain's own:
  `packages/silinx-fpga/bin/silinx-fpga.js`.
- **An MCP server** for an AI assistant on the projects of the workspace (`server/mcp.js`).
- **Security**: the pages' Content-Security-Policy (`server/csp.js`), the paths kept inside a project
  (`server/paths.js`), the server on this computer only unless asked ([SECURITY.md](../SECURITY.md)).

## How it is checked

- **Unit tests** (`test/*.test.js`, node:test) on `core/`, the server and the toolchain; **UI tests** (`test/ui/`) on a
  headless Chrome (`test/ui/harness.js`), Firefox and WebKit, in both interfaces.
- **The examples are the test designs** (`examples/`, `test/examples-lib.mjs`): each runs on every device of the
  Silinx toolchain and builds with ISE with no warnings.
- **The oracles**: ISE 14.7 for the toolchain (bitstream, DRC) and XST's Spartan-3E behaviour for the language; the C
  itself for Silinx HLS, Vitis HLS for its ports and interfaces.
- CI runs at a release; a pull request runs the tests of the modules it changes (CLAUDE.md).
