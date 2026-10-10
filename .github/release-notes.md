**Silinx ISE (Integrated Synthesis Environment)** is an ISE-style FPGA design environment that runs in the browser, made for teaching digital systems: VHDL/Verilog projects; schematics with live simulation; FSM and ASM state-machine editors, truth tables and Karnaugh maps, all kept in sync with their HDL; module and test bench wizards; behavioural and netlist simulation with waveforms; a board emulator; and Xilinx ISE 14.7 synthesis, implementation and board programming.

## Downloads

| File | What it is |
|---|---|
| **Silinx-ISE.html** | Single-file edition. Download it and open it in a browser: editor, schematics, ASM charts, simulation. Projects are kept in the browser (File ▸ Download Project Bundle to back them up). Synthesis and programming need the full app. |
| **silinx-ise-&lt;version&gt;.zip** | Full app with its dependencies. Needs [Node.js](https://nodejs.org) 20 or newer. Unzip, then run `node bin/silinx-ise.js serve` in the `silinx-ise` folder and open http://localhost:8642. Projects are stored in `~/Silinx-projects`. |
| **silinx-ise-docker-kit-&lt;version&gt;.zip** | Kit to build your own private Docker image of Xilinx ISE 14.7 (Windows, macOS Intel/Apple Silicon, Linux) for synthesis, place & route and bitstreams. ISE and its licence are not included and must not be redistributed: download them with your own AMD account. See `ise/README.md`. |

The source code is attached by GitHub below (Source code zip / tar.gz).

Silinx ISE is free software (GNU AGPL-3.0, Copyright 2026 Pedro Maló; see LICENSE, NOTICE and THIRD-PARTY-NOTICES.md). It is an independent project, not affiliated with or endorsed by AMD/Xilinx. Xilinx and ISE are trademarks of AMD.
