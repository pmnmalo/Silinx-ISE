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
- **RTL schematics**: the design drawn in the schematic editor, read-only, with sub-instances you
  push into with a double-click.
- **Schematic editor** (ISE Schematic Editor style): gates, muxes, adders/comparators, counters,
  flip-flops and registers, bus slices/joins, constants, I/O markers and any project module as a
  symbol; wires, buses and net names; Check Schematic. A schematic and its VHDL/Verilog file stay
  **synchronized**: edit either one and the other follows (the drawing is kept when the structure
  does not change). Any HDL module can be converted to a schematic (*Convert to Schematic*), with
  processes and other behavioural code kept as HDL blocks; *Convert to HDL* makes the HDL the base
  and keeps the schematic under it.
- **ISE schematics (.sch)**: schematics in ISE projects (XML and older text formats) are converted
  on import, with the Xilinx library symbols mapped to equivalent symbols or exact HDL blocks;
  exporting a project writes them back as ISE `.sch` files (*Export as ISE Schematic* for one).
- **Graphical ASM state-machine editor** (state, decision and conditional-output boxes) that
  generates synthesizable VHDL or Verilog (2/3-process style, binary/gray/one-hot/enum encoding)
  and adds it to the project.
- **Behavioural simulation** with XAIlinx's own simulator, written from scratch in JavaScript:
  4-state logic, delta cycles, VHDL/Verilog testbenches (`wait`, `#delay`, `assert`/`report`,
  `$display`, `$readmemh`…), an **ISim**-style waveform window, force/clock to simulate modules
  without a testbench, VCD export.
- **Implementation** with **Xilinx ISE 14.7** (XST → NGDBuild → MAP → PAR → TRCE → BitGen), run
  locally, in Docker or over SSH, with live per-step status (✓ / ⚠ / ✗) in the Processes panel
  (restored when the project is reopened), *Stop*, every warning/error in the Warnings/Errors tabs,
  and utilization/timing reports in the *Design Summary*. Simulation and editing stay available
  while an implementation runs. Ports without a pin constraint get free I/O pins automatically when
  no board is selected (with a warning; with a board they must be assigned).
- **Devices**: every FPGA family ISE 14.7 WebPACK implements — Spartan-3, Spartan-3E,
  Spartan-3A/3AN, Spartan-3A DSP, Spartan-6, Virtex-4/5/6, Artix-7, Kintex-7 and Zynq-7000
  (WebPACK parts). Full flows verified to a bitstream on Spartan-3E and Spartan-6.
- **Boards and I/O Pin Planning**: Digilent Basys2, Nexys2, Nexys3, Atlys, Cmod S6; Xilinx
  Spartan-3E / Spartan-3A / Spartan-3 starter kits; Numato Mimas V2 and Elbert V2; Papilio One.
  Ports are mapped to board resources by name, the UCF is generated, and pins are checked against
  the board before ISE runs.
- **Internationalised interface**: English and Portuguese (*View ▸ Language*; the browser language
  is used by default). Translations live in `web/js/i18n.js`: adding a language is adding a
  dictionary. Code, tool output and design names are never translated.
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
XAIlinx. The image keeps only what a command-line flow needs (ISE drops from ~18 GB to ~3 GB, all
device families kept); `--full` keeps the complete install and `--families "spartan3e spartan6"`
keeps only some families.

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
