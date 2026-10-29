# silinx-fpga

The Silinx toolchain for Spartan-3E FPGAs (Basys2, Nexys2) without Xilinx tools: synthesis with Yosys in
WebAssembly, then pack, place, route, timing and bitstream, with the device data. It is being separated from
Silinx ISE, the IDE that uses it ([#1651](https://github.com/pmnmalo/Silinx-ISE/issues/1651), the plan:
[docs/TOOLCHAIN-SEPARATION.md](../../docs/TOOLCHAIN-SEPARATION.md)). Its code is in `src/`, the device graphs of the
supported boards in `devices/`, their bit databases in `bitdb/`. Not published yet.

## The command line

```
silinx-fpga build <file.v ...|netlist.json> --part <part> [--top name] [--ucf pins.ucf] [-o top.bit]
  [--out-dir build] [--effort normal|high] [--seed N] [--no-replicate] [--quiet]
```

It synthesizes the Verilog with Yosys, or reads a Yosys JSON netlist, then packs, places, routes, checks the
timing and writes the bitstream. The parts are those of the Basys2 (`xc3s250e-cp132-4`, `xc3s100e-cp132-4`) and of
the Nexys2 (`xc3s500e-fg320-4`, `xc3s1200e-fg320-4`). The out folder (`build`) gets the netlist, the placed and
routed design (`placed.xdl`, `routed.xdl`) and the timing report (`timing.txt`); the warnings and errors go to
stderr. It exits with 0 when the `.bit` is written, 1 when the flow fails (the design, the constraints, the
routing) and 2 when the command line is wrong. VHDL needs Silinx ISE, whose front end turns it into Verilog.

A blinky for the Basys2: `blinky.v`,

```verilog
// The eight LEDs of the Basys2 count: the slowest bits of a counter of the 50 MHz clock
module blinky(input clk, output [7:0] led);
  reg [31:0] count = 0;
  always @(posedge clk) count <= count + 1;
  assign led = count[31:24];
endmodule
```

its pins, `basys2.ucf`,

```ucf
NET "clk" LOC = "B8";
NET "clk" PERIOD = 20 ns;
NET "led<0>" LOC = "M5";
NET "led<1>" LOC = "M11";
NET "led<2>" LOC = "P7";
NET "led<3>" LOC = "P6";
NET "led<4>" LOC = "N5";
NET "led<5>" LOC = "N4";
NET "led<6>" LOC = "P4";
NET "led<7>" LOC = "G1";
```

and its bitstream, for the board's programmer (Digilent Adept, or Silinx ISE's iMPACT):

```
silinx-fpga build blinky.v --part xc3s250e-cp132-4 --ucf basys2.ucf -o blinky.bit
```

## The API

Three entries; a name they do not export is the package's own and may change in any version.

- `silinx-fpga` (`src/index.js`): the same in Node and in the browser. The flow (`runFlow`, `OPEN_STEPS`,
  `StepError`), the synthesis (`synthesizeVerilog`), the netlist and the constraints in (`readYosysJson`,
  `parseUcf`), the implementation's steps for a flow of one's own (`pack`, `placeRouteBest`, `bitgen`), the placed
  and routed design and the bitstream out (`parseXdl`, `writeXdl`, `readBit`), the reports (`analyzeTiming`,
  `timingReport`, `estimatePower`, `powerReport`), the devices and bit databases from their files' contents
  (`loadDevice`, `makeBitDb`), the parts (`familyOfPart`, `resourcesOf`).
- `silinx-fpga/parts` (`src/parts.js`): the light part of it, for an interface that shows a design and its board
  and loads the toolchain only when it runs: the parts (`familyOfPart`, `resourcesOf`), the constraints
  (`parseUcf`, `generateUcf`), the steps by name (`OPEN_STEPS`), the XDL format (`parseXdl`, `lutTable`).
- `silinx-fpga/node` (`src/node.js`): all of it, with the device graphs and bit databases read from the disk
  (`findDeviceGraph`, `loadDeviceCache`, `loadDb`) and Yosys run in Node (`yosysNode`, `yosysWorkers`).

The flow takes the design and gives its files through an `io` (each hook is described at the top of
`src/open-flow-core.js`):

```js
import { runFlow, findDeviceGraph, loadDeviceCache, loadDb, yosysNode } from 'silinx-fpga/node';
import fs from 'node:fs';

const part = 'xc3s250ecp132-4';   // the Basys2's
let device, bitDb;
const io = {
  log: line => console.log(line),
  sources: () => [{ path: 'blinky.v', lang: 'verilog', text: fs.readFileSync('blinky.v', 'utf8') }],
  ucf: fs.readFileSync('basys2.ucf', 'utf8'),
  device: () => (device ||= loadDeviceCache(findDeviceGraph(part))),
  bitDb: () => (bitDb ||= loadDb('xc3s250ecp132', { graph: io.device() })),
  yosys: yosysNode,
  write: (name, data) => { fs.mkdirSync('build/open', { recursive: true }); fs.writeFileSync(`build/${name}`, data); return `build/${name}`; },
  read: name => (fs.existsSync(`build/${name}`) ? fs.readFileSync(`build/${name}`, 'utf8') : null),
  save: report => {},
};
const { ok, report } = await runFlow({ top: 'blinky', part, device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e',
  steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'] }, io);
// build/blinky.bit, build/open/routed.xdl, build/open/timing.txt; report: the utilisation, the timing
```

The sources are flat Verilog; VHDL needs an HDL front end (`io.frontEnd`, Silinx ISE's). The place and route is
Silinx's own unless `io.placeRoute` gives another engine (`placeRouteBest`'s arguments and result).

Licence: Apache-2.0 ([LICENSE](LICENSE)), its code and its data.
