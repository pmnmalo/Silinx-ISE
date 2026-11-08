**Silinx ISE (Integrated Synthesis Environment)** is an ISE-style FPGA design environment that runs in the browser, made for teaching digital systems: VHDL/Verilog projects; schematics with live simulation; FSM and ASM state-machine editors, truth tables and Karnaugh maps, all kept in sync with their HDL; module and test bench wizards; behavioural and netlist simulation with waveforms; a board emulator; synthesis, place & route and bitstreams with its own toolchain (the Basys2 and Nexys2 boards) or with Xilinx ISE 14.7; and board programming, also from the browser.

## Downloads

| File | What it is |
|---|---|
| **Silinx.html** | Single-file edition, the same app as the site (https://pmnmalo.github.io/Silinx-ISE/). Download it and open it in a browser: design, simulation, synthesis, place & route and bitstream (the Silinx toolchain, Basys2 / Nexys2; its tools come from the site the first time). Projects are kept in the browser (File ▸ Download Project Bundle to back them up) or, in Chrome / Edge, in a folder on the disk. Programming the board's FPGA and Platform Flash over USB works from the site's address (Chrome / Edge, Chrome on Android). |
| **silinx-&lt;version&gt;.zip** | Silinx run locally, with its dependencies: an alternative to the site (offline synthesis, projects as folders, the installed programmers, Xilinx ISE 14.7 modes). Needs [Node.js](https://nodejs.org) 18 or newer. Unzip, then double-click `Start Silinx.bat` (Windows), `Start Silinx.command` (macOS) or `start-silinx.sh` (Linux) in the `silinx-ise` folder; Silinx opens at http://127.0.0.1:8642. Projects are stored in `~/Silinx-projects`. |
| **silinx-docker-kit-&lt;version&gt;.zip** | Kit to build your own private Docker image of Xilinx ISE 14.7 (Windows, macOS Intel/Apple Silicon, Linux) for synthesis, place & route and bitstreams. ISE and its licence are not included and must not be redistributed: download them with your own AMD account. See `ise/README.md`. |

The source code is attached by GitHub below (Source code zip / tar.gz).

Silinx ISE is free software (GNU AGPL-3.0, Copyright 2026 Pedro Maló; see LICENSE, NOTICE and THIRD-PARTY-NOTICES.md). It is an independent project, not affiliated with or endorsed by AMD/Xilinx. Xilinx and ISE are trademarks of AMD.
