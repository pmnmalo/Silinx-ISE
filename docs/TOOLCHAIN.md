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
                 │ synth      Yosys synth_xilinx        <top>.json  │
                 │ translate  the netlist and the UCF read          │
                 │ map        pack: Silinx's (S6), nextpnr's (S3E)  │
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

Map and Place & Route have one engine in the application, nextpnr (#2137); a project saved with another
(`impl.engine` `silinx` or `auto`, Process Properties' choice of #2136) moves to it:

| Family | Map | Place & Route |
|---|---|---|
| Spartan-3E | nextpnr packs the design at Place & Route | nextpnr |
| Spartan-6 | Silinx's packer (`fpga/s6/`) | nextpnr; the pads, global buffers, block RAMs and DSPs placed by Silinx's rules first |

On a Spartan-6, Process Properties' Map (Spartan-6) can be nextpnr (on trial until its parity, #3138, #3139;
`impl.s6Map` `nextpnr`, the MCP tool `set_process_properties`'s `s6_map`): nextpnr packs Yosys's netlist into the sites of
Silinx's packer and places them, its pads and clocks by its own rules (`fpga/s6/nextpnr-pack.js`); Silinx checks the sites
are the same, then routes as with its own Map.

There is no fallback: where nextpnr cannot start (its chip database not downloaded yet, offline) Place & Route fails,
saying so. **nextpnr replaced Silinx's placer and router** (decided in #2131; parity in #2135, #2797; removed in #2137, the
Spartan-3E's placer and router, and #2824, the Spartan-6's router, its placer kept for the sites nextpnr is given fixed:
pads, global buffers, block RAMs, DSPs; their parts other modules use are in `fpga/device-sites.js`, `fpga/place-common.js`,
`fpga/route-check.js`, `fpga/clock-reach.js`). The open synthesis counts the slices as nextpnr packs them (`slice-estimate.js`, #2529). The Post-Map model is written
from nextpnr's packing: its routed design without the routing (#2530).
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
 The tools        Yosys │ nextpnr │ Silinx's packer (S6, the slice count) │ timing │ bitgen
                     │
 The data         device descriptions │ bit databases
```

### `io`: the outside world

Everything outside the flow comes through `io`, so the same flow runs in Node (files on disk) and in the browser (files
in memory): the sources, the constraints, the device, the bit database, Yosys, nextpnr, the files written, the report.
The list is at the top of `src/open-flow-core.js`. nextpnr is one hook by micro-architecture:
`io.nextpnr.spartan3e`, `io.nextpnr.spartan6`, `io.nextpnr.ice40` (with icepack: `pack(asc)`), `io.nextpnr.xc7` (the 7-series', #3146), `io.nextpnr.ecp5` (with ecppack: `pack(config)`).

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
| Spartan-3E | `synth_xilinx` | nextpnr | Silinx | UCF | Works, browser and local |
| Spartan-6 | `synth_xilinx` | nextpnr | Silinx | UCF | Works, browser (#2103, #2288) and local |
| iCE40 | `synth_ice40` | nextpnr-ice40 | `icepack` | PCF | Works: local server and browser, nextpnr-ice40 downloaded on first use (#2444); its 12 parts in the interface (#2463), the iCEBreaker board (#2517), other boards #2297 |
| ECP5 | `synth_ecp5` | nextpnr-ecp5 | `ecppack`, Project Trellis | LPF | Works: local server and browser, nextpnr-ecp5 downloaded on first use (30 MB); its 10 parts, the ULX3S board and the examples on it (#2302); its board programmed by the local server's openFPGALoader or the browser over WebUSB (SRAM, #2298) |
| MachXO2 | to be defined | nextpnr-machxo2, not yet stable | `ecppack`, Project Trellis | LPF | To be measured (#2302) |
| Gowin | `synth_gowin` | nextpnr-himbaechel-gowin | `gowin_pack`, Silinx's JavaScript port of Apicula's (`src/fpga/gowin/`) | CST | Works: local server and browser, downloaded on first use (32 MB); the GW1NR-9C, the Tang Nano 9K and the examples on it, their `.fs` Apicula's byte for byte, the rPLL and the oscillator too (#2303); its board programmed by the local server's openFPGALoader or the browser over WebUSB (SRAM, #2298) |
| Cyclone V | `synth_intel_alm` | nextpnr, not yet stable | Mistral | to be defined | To be measured (#2304) |
| Xilinx 7-series (Artix-7) | `synth_xilinx` | nextpnr-himbaechel's xilinx, `@silinx/nextpnr-himbaechel-xc7` (#3143) | Silinx, from nextpnr's FASM on Project X-Ray's database (#3144) | XDC | An experimental family (#3146): the Basys 3's XC7A35T and the Nexys A7's XC7A100T (#3145) in the local server (AMD Vivado the default there) and in the browser (#3143: the Basys 3's `.bit` the local server's byte for byte); its timing nextpnr's estimate; every example on both boards, its size and speed below (#3147) |

Done: the routed design is opaque to the orchestrator (#2384); XDL and `open/routed.xdl` are the Xilinx back ends'. The
constraints are one model (`constraints.js`, #2385): the back end says its format, a reader and a writer, UCF by default; the
other formats are #2296. The synthesis is the back end's (#2386): the Xilinx families' `synth_xilinx` with Silinx's mappings,
another family's Yosys script (`scriptSynthesis`), and the report's names; `FAMILY_INFO` needs only a family's name. The steps are the back end's (#2387): its list, each step's label and what it
needs (`orderSteps`), ISE's names for the Xilinx families. A fake family runs in Node and in the browser's worker (#2388,
`web/js/open-flow-worker-io.js`). The iCE40 is the first family on them (#2295, `src/open-flow-ice40.js`): YoWASP's
`@yowasp/nextpnr-ice40` (about 80 MB, every iCE40's chip database) is an optional peer dependency of the package and a development
one of the IDE: the release zip and the published site download it from npm's registry on the first iCE40 run, at
`package-lock.json`'s version and SHA-512, and keep it (`server/nextpnr-ice40-fetch.js`, `web/js/nextpnr-ice40-browser.js`, #2444).
The ECP5 is the second (#2302, `src/open-flow-ecp5.js`, `src/lpf.js`): YoWASP's `@yowasp/nextpnr-ecp5` the same way,
`io.nextpnr.ecp5` with ecppack (`pack(config)`); the families of YoWASP's tools are data in their profiles
(`core/family-profile.js` openFlow: the package, its packer, the browser edition's key) and in the server's `OWN` and `OWN_TOOLS`.
The Gowin is the third (#2303, `src/open-flow-gowin.js`, `src/cst.js`): `@yowasp/nextpnr-himbaechel-gowin`, `io.nextpnr.gowin` with
nextpnr and gowin_pack (`pack(routedJson, family)`: Silinx's port, `src/fpga/gowin/`, on Apicula's database read from the package's
resources: Silinx ships none of Apicula's data; the rPLL and the oscillator ported, `src/fpga/gowin/pll-osc.js`, the other PLLs, IOLOGIC
and LVDS refused by name); a port with no pin is an error (nextpnr-himbaechel-gowin places none), a
clock's period a comment of the CST given to nextpnr as `--freq`.
The 7-series (#3146, `src/open-flow-xc7.js`) is the first of Silinx's own nextpnr packages on them: `@silinx/nextpnr-himbaechel-xc7` (nextpnr's
xilinx micro-architecture, about 2.8 MB, and a chip database per device beside it, 3.3 MB the xc7a50t's that the xc7a35t takes),
`io.nextpnr.xc7`, and the bitstream from its FASM on Project X-Ray's bit database (`bitdb/xc7/<part>.json.gz`, 0.3 MB the
xc7a35t's). The browser edition publishes them as the Spartan-3E's and the Spartan-6's (#3143): `assets/vendor/nextpnr-xc7/<its
version>/gen|chipdb/` and `assets/<version>/bitdb/xc7/`, a part available where the build found its bit database (the page's
layout `xc7Parts`), fetched into Cache Storage when a project opens; nextpnr routes with router2 as the local server does (about
1.3 GB of the browser's memory for the xc7a35t, its `.bit` the server's), router1 again where router2 stops without an error of
its own, out of memory (`web/js/nextpnr-router-fallback.js`, a warning says so).

Every example builds on the Basys 3 and the Nexys A7 with no warning, each clock at the boards' 100 MHz by nextpnr's
estimate (#3147, `test/open-flow-xc7-server.test.js`, which holds each build to these numbers: up to 15 % more LUTs, the
registers within 10 %, the frequency up to 15 % lower). The LUTs are nextpnr's count (each 6LUT and 5LUT, its feed-throughs
included): Vivado counts a LUT site once, about 4–13 % fewer on blinky, vga and micro80 (#3160); Vivado's numbers on
every example are to join the weekly quality comparison (#3760).

| Example | Basys 3: LUTs | registers | MHz | Nexys A7: LUTs | registers | MHz |
|---|---|---|---|---|---|---|
| gates | 1 | 0 | – | 1 | 0 | – |
| traffic | 87 | 58 | 213.6 | 86 | 58 | 199.3 |
| blinky | 101 | 130 | 241.6 | 98 | 130 | 276.4 |
| pong | 252 | 207 | 159.0 | 244 | 207 | 155.9 |
| stopwatch | 184 | 201 | 210.6 | 184 | 201 | 225.9 |
| clock | 149 | 158 | 268.4 | 146 | 158 | 240.9 |
| vga | 125 | 56 | 257.2 | 124 | 56 | 234.2 |
| isqrt | 72 | 86 | 282.9 | 73 | 86 | 316.8 |
| uart | 122 | 138 | 257.6 | 122 | 138 | 260.0 |
| micro80 | 169 | 185 | 146.4 | 179 | 185 | 150.1 |

And around the flow, one issue each: the boards and examples (#2297), the primitives' simulation models
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
