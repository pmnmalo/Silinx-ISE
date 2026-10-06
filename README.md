# XAIlinx

A reprogrammable-hardware design platform in the style of the **Xilinx ISE 14.x Project Navigator**,
for Xilinx FPGAs supported by ISE 14.7.

- **Projects** made of **VHDL and/or Verilog** modules (mixed language), with *Implementation* /
  *Simulation* roles, implementation and simulation tops, UCF constraints, and ISE project
  import/export (`.zip` with the `.xise` and all files).
- **HDL editor**: syntax highlighting, context-aware auto-complete (signals, ports, constants,
  project modules, `numeric_std` functions, `$system` tasks), *Language Templates*, live errors,
  type tooltips, *go to definition* (Ctrl/Cmd+click, F12), folding, comment toggling (Ctrl+/),
  find/replace.
- **Hierarchical RTL schematics** (ELK auto-layout): logic gates, multiplexers, adders/comparators,
  registers, sub-instances you push into with a double-click, SVG export.
- **Graphical ASM state-machine editor** (state, decision and conditional-output boxes) that
  generates synthesizable VHDL or Verilog (2/3-process style, binary/gray/one-hot/enum encoding)
  and adds it to the project.
- **Behavioural simulation** with XAIlinx's own simulator, written from scratch in JavaScript:
  4-state logic, delta cycles, VHDL/Verilog testbenches (`wait`, `#delay`, `assert`/`report`,
  `$display`, `$readmemh`…), an **ISim**-style waveform window, force/clock to simulate modules
  without a testbench, VCD export.
- **Implementation** with **Xilinx ISE 14.7** (XST → NGDBuild → MAP → PAR → TRCE → BitGen), run
  locally, in Docker or over SSH, with live per-step status (✓ / ⚠ / ✗) in the Processes panel and
  utilization/timing reports in the *Design Summary*.
- **I/O Pin Planning** from a board database (Spartan-3E Starter Kit, Digilent Basys2, Nexys2),
  generating the UCF; pins are checked against the board before ISE runs.
- **Programming** (iMPACT-like): the FPGA (volatile) or the board's Platform Flash PROM (boots at
  power-up), with openFPGALoader, xc3sprog, Digilent Adept (`djtgcfg`), ISE iMPACT or
  **adepttool** (Basys2 on macOS).

## Getting started

```bash
npm install
npm start          # http://127.0.0.1:8642
```

Projects live in `~/XAIlinx-projects` (override with `XAILINX_WORKSPACE`). Use *File ▸ New Project*
or *Open Example (blinky)* on the Start page.

### Command line

```bash
node bin/xailinx.js check <projectDir>                           # parse + elaborate the top
node bin/xailinx.js sim   <projectDir> --time 2000 --vcd out.vcd   # simulate the simulation top
node bin/xailinx.js ucf   <projectDir> --board basys2              # constraints from a board's pin table
node bin/xailinx.js toolchain [--docker xailinx/ise:14.7]          # show / set the ISE toolchain
npm test                                                         # test suite
```

### Standalone edition (a single HTML file)

```bash
npm run build:standalone    # writes dist/XAIlinx.html (~2.5 MB)
```

One file, no server: open it in a browser or share it. It includes the editor, schematics, ASM
editor, simulation/ISim, pin planner and ISE project import/export; the *blinky* example is
embedded. Projects are stored in the browser (*File ▸ Download / Open Project Bundle* to move
them). Synthesis, implementation and programming need the full application (`npm start`).

## Synthesis and bitstreams (Xilinx ISE 14.7)

There is no open-source toolchain that generates bitstreams for these Xilinx families, so
implementation uses the ISE 14.7 command-line tools (WebPACK edition: free, with a free license).

**Recommended on Windows, macOS (Intel / Apple Silicon) and Linux:** build a private Docker image
once with the kit in [`docker/ise/`](docker/ise/README.md), from your own installer and WebPACK
license (ISE itself may not be redistributed):

```bash
docker/ise/build-ise-image.sh --installer ~/Downloads/Xilinx_ISE_DS_Lin_14.7_1015_1.tar --license ~/Downloads/Xilinx.lic
```

On Windows use `docker\ise\build-ise-image.ps1`. The script checks the installer and x86-64
emulation, builds `xailinx/ise:14.7`, proves the license with a test synthesis and configures
XAIlinx.

Other execution modes (*Tools ▸ Toolchain Settings*):

| Mode | Description |
|---|---|
| `local` | ISE installed on this machine (Linux/Windows); `settings64.sh` is detected |
| `docker` | an x86-64 image with ISE 14.7 at `/opt/Xilinx/14.7/ISE_DS` (XAIlinx never pulls images) |
| `ssh` | a remote Linux machine with ISE (key-based authentication) |

Only the project's `build/` folder is mounted in the container (at `/work`); no X11 or `$HOME`
mount is needed for command-line builds. Without ISE, the implementation processes still write
`build/` with `run.sh`, `.prj`, `.xst`, `.ut` and the UCF, ready to run on another machine.

## Programming the board

Programming loads the `.bit` into the FPGA's configuration SRAM (volatile). Supported tools:
Digilent Adept (`djtgcfg`), ISE iMPACT, xc3sprog, openFPGALoader and **adepttool**.

**Basys2 on macOS**: Digilent Adept is not available for macOS; use *adepttool* (open source,
the Basys2's on-board USB), which XAIlinx uses automatically when `djtgcfg` is not installed:

```bash
brew install libusb python
./scripts/install-adepttool.sh     # installs into ~/.xailinx/adepttool (own virtualenv)
```

The script applies `scripts/adepttool-xailinx.patch` (claims the USB interface, required on macOS,
and adds the XC3S250E/500E/1200E/1600E IDCODEs). Tested on a real Basys2-250: JTAG scan
(XCF02S + XC3S250E) and programming with DONE.

### Platform Flash PROM: boot at power-up

On the **iMPACT** page, select the PROM in the JTAG chain (Basys2: XCF02S) for *Program PROM*
(erase → write → verify), *Verify*, *Erase*, *Back up PROM* (saved in `build/prom-backup/`) and
*Reload FPGA from PROM*. The image is `build/<top>_prom.bit`, generated with `StartUpClk:CCLK` by
*Generate Programming File*. To boot from flash at power-up, set the mode jumper to **ROM**
(Basys2: JP3). Uses `scripts/xcf_prog.py` (adepttool) over the board's USB.

## Layout

```
core/       VHDL/Verilog parsers, elaborator, simulator, schematics, ASM, UCF, zip (browser + Node)
server/     HTTP server, projects, ISE flow, programmers, boards/devices, .xise
web/        Project Navigator UI (ISE-like): editor, ISim, schematics, ASM, pin planner, iMPACT
docker/ise/ builder kit for the private Xilinx ISE 14.7 Docker image
scripts/    adepttool installer/patch, Platform Flash programmer, standalone build
examples/   example projects (mixed VHDL+Verilog blinky for the Digilent Basys2, XC3S250E-CP132)
docs/       IR.md (parser intermediate representation), PROJECT.md (project model and API)
test/       node:test suites
```

Xilinx, ISE, ISim, iMPACT and Spartan are trademarks of AMD/Xilinx; XAIlinx is not affiliated
with them.
