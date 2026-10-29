# silinx-fpga

The Silinx toolchain for Spartan-3E FPGAs (Basys2, Nexys2) without Xilinx tools: synthesis with Yosys in
WebAssembly, then pack, place, route, timing and bitstream, with the device data. It is being separated from
Silinx ISE, the IDE that uses it ([#1651](https://github.com/pmnmalo/Silinx-ISE/issues/1651), the plan:
[docs/TOOLCHAIN-SEPARATION.md](../../docs/TOOLCHAIN-SEPARATION.md)). Its code is in `src/`, the device graphs of the
supported boards in `devices/`, their bit databases in `bitdb/`. Not published yet.

## The API

Two entries; a name they do not export is the package's own and may change in any version.

- `silinx-fpga` (`src/index.js`): the same in Node and in the browser. The flow (`runFlow`, `OPEN_STEPS`,
  `StepError`), the synthesis (`synthesizeVerilog`), the netlist and the constraints in (`readYosysJson`,
  `parseUcf`), the implementation's steps for a flow of one's own (`pack`, `placeRouteBest`, `bitgen`), the placed
  and routed design and the bitstream out (`parseXdl`, `writeXdl`, `readBit`), the reports (`analyzeTiming`,
  `timingReport`, `estimatePower`, `powerReport`), the devices and bit databases from their files' contents
  (`loadDevice`, `makeBitDb`), the parts (`familyOfPart`, `resourcesOf`).
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
