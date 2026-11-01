# The toolchain's architecture

What takes a design to a `.bit` in Silinx: the process, the tools, what is the toolchain and what is not, how a family
fits in, and how a result is checked. Other documents go deeper: [OPEN-TOOLCHAIN.md](OPEN-TOOLCHAIN.md) (how the bit
database is measured, the legal basis), [TOOLCHAIN-SEPARATION.md](TOOLCHAIN-SEPARATION.md) (the package's separation),
[QUALITY.md](QUALITY.md) (size and speed against ISE).

## What is the toolchain

**The toolchain is the package `silinx-fpga`** (`packages/silinx-fpga`): from HDL as flat Verilog, or a Yosys netlist, to
the `.bit`. It works without the IDE, as a library (`runFlow(spec, io)`) and a command line (`silinx-fpga build`). Not
everything on the way from a design to a programmed board is in it:

| Part | Where | Is it the toolchain? |
|---|---|---|
| The drawings (schematic, ASM, FSM, truth table, Petri net), the C of Silinx HLS: the HDL they generate | `core/`, `web/js/` | No, the IDE: the toolchain receives their HDL |
| The HDL front end: VHDL and Verilog elaborated into one flat Verilog module | `core/synth-front.js`, `core/synth-verilog.js` | No, the IDE, given through `io.frontEnd`; alone, the package reads Verilog only |
| The synthesis's scripts and what Silinx adds around Yosys (state machines, carry chains, LUT resynthesis) | `src/synth-open.js`, `synth-fsm.js`, `carry-chain.js`, `lut-resynth.js` | **Yes** |
| Yosys, nextpnr | npm: `@yowasp/yosys`, `@silinx/nextpnr-himbaechel-*` | Dependencies of the toolchain, in WebAssembly |
| Pack, place, route, timing, power, bitstream | `src/fpga/` | **Yes** |
| The device descriptions and the bit databases | `devices/`, `bitdb/` | **Yes**, its data |
| The steps' order, the families' back ends | `src/open-steps.js`, `open-flow-core.js`, `open-flow-backends.js` | **Yes** |
| The simulation models (post-synthesis to post-route) | `core/flow-models.js`, given through `io.simModels` | No, the IDE |
| Running the flow: a process on disk, a Web Worker in memory | `server/open-flow*.js`, `web/js/open-flow-*.js` | No, the IDE's hosts of `runFlow` |
| Programming the board | `core/adept.js`, `core/xcf.js`, `server/programmer*.js` | No, the IDE |
| Xilinx ISE 14.7 | `server/ise.js` runs it; the user installs it | No: another tool, and the open flow's oracle |

## The process

```text
 drawings, C ──> HDL ──> front end ──> flat Verilog
                                          │
                 ┌────────────────────────▼─────────────────────────┐
                 │ runFlow (silinx-fpga)                            │
                 │                                                  │
                 │ synth      Yosys synth_xilinx        netlist.json│
                 │ translate  the netlist and the UCF read          │
                 │ map        pack into slices and I/O sites        │
                 │ par        place, route, check       routed.xdl  │
                 │ trce       static timing             timing.txt  │
                 │ bitgen     from the bit database     <top>.bit   │
                 │ prombit    the same, for the PROM    _prom.bit   │
                 └────────────────────────┬─────────────────────────┘
                                          ▼
                              Configure Target Device
```

ISE's flow has the same stages: XST, NGDBuild, MAP, PAR, TRCE, BitGen.

The chain is `OPEN_CHAIN` in `src/open-steps.js`. Optional steps go into it: the simulation models, the pins
(`pin2ucf`), the power estimate (`xpwr`), the FPGA view. The synthesis does not run again while it is up to date.

## The engines

Map and Place & Route have two engines, chosen by the project (`impl.engine`, Process Properties):

| Engine | Spartan-3E | Spartan-6 |
|---|---|---|
| `silinx`, the default | Silinx's packer, placer and router | The same, its own modules (`fpga/s6/`) |
| `nextpnr` | nextpnr packs, places and routes | Silinx's packer; nextpnr places and routes; local server only (#2288) |
| `auto` | nextpnr when it can implement the design, else `silinx`, which Map says | `silinx` |

**nextpnr replaces Silinx's packer, placer and router** (decided in #2131): they stay until nextpnr reaches parity (the
examples on all four Spartan-3E devices, clean in ISE, at least Silinx's size and speed), then #2137 removes them.
The micro-architectures live in the fork `pmnmalo/nextpnr-spartan`. What stays Silinx's in any case: the timing, the bitstream
and their data. nextpnr's routed design is converted to XDL (`fpga/nextpnr-xdl.js`), which those steps read.

## The layers

```text
 The IDE          editors, processes, front end, simulation models, programmer
                     │ spec, io
 The orchestrator runFlow: the steps, the log, the report; names no family, no engine
                     │ backendOf(spec.family).mount(ctx)
 The back ends    spartan3e │ spartan6 │ (a new family)
                     │
 The tools        Yosys │ nextpnr │ Silinx's pack, place, route │ timing │ bitgen
                     │
 The data         device descriptions │ bit databases
```

### `io`: the outside world

Everything outside the flow comes through `io`, so the same flow runs in Node (files on disk) and in the browser (files
in memory): the sources, the constraints, the device, the bit database, Yosys, nextpnr, the files written, the report.
The list is at the top of `src/open-flow-core.js`. nextpnr is one hook by micro-architecture:
`io.nextpnr.spartan3e`, `io.nextpnr.spartan6`, `io.nextpnr.ice40` (with icepack: `pack(asc)`).

### The back ends

A family is an object (`src/open-flow-backends.js`, #2360):

```js
{
  id: 'spartan3e',
  steps,        // optional: its steps, [{ id, label, needs }], run in this order (#2387); the Xilinx families' when not
                //   given (open-steps.js XILINX_STEPS: ISE's names, the processes' labels)
  mount(ctx),   // { steps: { id: run() }, packed? }: the functions of its steps, with its engines, but the synthesis's and
                //   the simulation models' (runFlow's own); ctx.readNetlist for the step that reads the netlist; the
                //   routed design is the back end's, in its format and file (#2384)
  synth,        // optional: the synthesis, synthesizeVerilog's signature and result: the Xilinx families' synthesizeVerilog
                //   (synth_xilinx and its mappings), another family's scriptSynthesis({ script }) (synth-script.js, #2386);
                //   Yosys's generic synth when not given
  synthName,    // optional: (id, resource) -> the name of a line of the synthesis's report (the Spartan-3E's as XST's)
  constraints,  // optional: the constraints' format { id, read, write } (constraints.js, #2385); UCF when not given
}
```

`registerBackend(backend)` adds a family. A family with no back end is implemented as the Spartan-3E is: the families only ISE
implements never get there, because the server's `openStatus` stops them first.
`test/open-flow-backends.test.js` runs a fake family through the flow and keeps family and engine names out of the orchestrator.

## Adding a family

The plan is in #1953 and #2315. For the open toolchains:

| Family | Synthesis | Place and route | Bitstream | Constraints | Status |
|---|---|---|---|---|---|
| Spartan-3E | `synth_xilinx` | Silinx, nextpnr | Silinx | UCF | Works, browser and local |
| Spartan-6 | `synth_xilinx` | Silinx, nextpnr | Silinx | UCF | Works, browser (the Silinx engine, #2103) and local |
| iCE40 | `synth_ice40` | nextpnr-ice40 | `icepack` | PCF | Works, local server, and the browser's worker where the server serves it; its 12 parts in the interface (#2463), no board yet (#2297) |
| ECP5, MachXO2 | `synth_ecp5`, to be defined | nextpnr | `ecppack`, Project Trellis | LPF | Planned (#2302) |
| Gowin | `synth_gowin` | nextpnr-himbaechel | `gowin_pack` (Python: the browser's path is to be decided) | CST | Planned (#2303) |
| Cyclone V | `synth_intel_alm` | nextpnr, not yet stable | Mistral | to be defined | To be measured (#2304) |
| Xilinx 7-series | to be defined | nextpnr in the fork | to be written in JavaScript | to be defined | A spike first (#2305) |

Done: the routed design is opaque to the orchestrator (#2384); XDL and `open/routed.xdl` are the Xilinx back ends'. The
constraints are one model (`constraints.js`, #2385): the back end says its format, a reader and a writer, UCF by default; the
other formats are #2296. The synthesis is the back end's (#2386): the Xilinx families' `synth_xilinx` with Silinx's mappings,
another family's Yosys script (`scriptSynthesis`), and the report's names; `FAMILY_INFO` needs only a family's name. The steps are the back end's (#2387): its list, each step's label and what it
needs (`orderSteps`), ISE's names for the Xilinx families. A fake family runs in Node and in the browser's worker (#2388,
`web/js/open-flow-worker-io.js`). The iCE40 is the first family on them (#2295, `src/open-flow-ice40.js`): YoWASP's
`@yowasp/nextpnr-ice40` (about 80 MB, every iCE40's chip database) is an optional dependency of the package and a development
one of the IDE, so the release zip and the published site do not have it yet.

And around the flow, one issue each: the boards and examples (#2297), programming (#2298), the primitives' simulation models
(#2299), the reports (#2300). In the interface: the device profile (#2310), the tool descriptor (#2311), personalities (#2312).

Vendor tools (ISE, Vivado, Quartus) are another kind of back end: they run a whole flow externally and give reports and a
`.bit`. They share the tool descriptor with the open flows, not an implementation.

## How a result is checked

- **ISE is the oracle of the Xilinx families** (`npm run check:open-flow`). ISE converts the same `routed.xdl` and runs its DRC:
  no error, no warning, and its `.bit` is byte-identical to Silinx's. This proves the bitstream and that the routing is legal; it does
  not compare our placement with PAR's. Size and speed against XST are the weekly quality comparison.
- **The examples are the test designs** on every device of `TARGETS`.
- **The other families have no such oracle.** What proves a build there is to be decided (#2301): post-route simulation against the
  design, the families' timing tools, the vendors' tools where available, runs on real boards.
