**XAIlinx ISE (Integrated Synthesis Environment)** is an ISE-style FPGA design environment that runs in the browser: VHDL/Verilog projects, schematic and ASM state-machine editors kept in sync with HDL, behavioural simulation with waveforms, and Xilinx ISE 14.7 implementation and board programming.

## Downloads

| File | What it is |
|---|---|
| **XAIlinx.html** | Single-file edition. Download it and open it in a browser: editor, schematics, ASM charts, simulation. Projects are kept in the browser (File ▸ Download Project Bundle to back them up). Synthesis and programming need the full app. |
| **xailinx-&lt;version&gt;.zip** | Full app with its dependencies. Needs [Node.js](https://nodejs.org) 20 or newer. Unzip, then run `node bin/xailinx.js serve` in the `xailinx` folder and open http://localhost:8642. Projects are stored in `~/XAIlinx-projects`. |
| **xailinx-ise-docker-kit-&lt;version&gt;.zip** | Kit to build your own private Docker image of Xilinx ISE 14.7 (Windows, macOS Intel/Apple Silicon, Linux) for synthesis, place & route and bitstreams. ISE and its licence are not included and must not be redistributed: download them with your own AMD account. See `ise/README.md`. |

The source code is attached by GitHub below (Source code zip / tar.gz).

XAIlinx ISE is an independent open-source project, not affiliated with or endorsed by AMD/Xilinx. Xilinx and ISE are trademarks of AMD.
