# How the Silinx toolchain is developed

This document records how Silinx develops its Silinx toolchain for the Xilinx Spartan-3E: synthesis,
place and route, and bitstream generation without Xilinx ISE. It describes the method, the
limits the project keeps to, and the legal basis it relies on. It is kept up to date as the
work progresses, and the experiments it describes are kept in the repository so that anyone can
check and repeat them.

> This document is not legal advice. It records the method and the legal basis the project relies
> on, so that a lawyer can review them. Before the bit database or the open flow is published, the
> method should be reviewed by a qualified lawyer.

## Why

Silinx is used to teach Digital Systems with Digilent Basys2 boards (Xilinx Spartan-3E XC3S250E),
many of which are still in use. The only tool able to produce bitstreams for them is Xilinx ISE
14.7. AMD/Xilinx stopped developing ISE in 2013, and it needs an old Linux system, a Windows VM or
a Docker image to run.

The goal is **interoperability**: to let the owners of these boards keep using hardware they
already own, with a free, maintained toolchain. The goal is not to copy ISE, to compete with AMD's current products,
or to get around any protection.

## What the Silinx toolchain is made of

| Stage | Tool | Origin |
|---|---|---|
| VHDL / Verilog front end | Silinx (AGPL-3.0): the elaborated design as one flat module | written for Silinx |
| Synthesis | Yosys `synth_xilinx -family xc3se` (ISC), compiled to WebAssembly by YoWASP: it runs in the browser | independent open-source projects |
| Place and route | Silinx (AGPL-3.0) | written for Silinx |
| Bitstream | Silinx (AGPL-3.0), from the bit database below | written for Silinx |
| Device description (the chip's wires and routing switches) | The Spartan-3E boards' devices (XC3S100E-CP132, XC3S250E-CP132, XC3S500E-FG320, XC3S1200E-FG320) and the Spartan-6 boards' (XC6SLX16-CSG324, XC6SLX45-CSG324, for the toolchain under development, #1): shipped with Silinx (`packages/silinx-fpga/devices/`). Other devices: each user builds it once from their own ISE | computed by Silinx from the output of ISE's documented `xdl -report` command |

The bitstream generator needs a **bit database**: which configuration bits set each feature of the
chip (each LUT memory bit, each multiplexer setting inside a slice, each I/O setting, each routing
switch). It is built by black-box observation, as described below.

**Devices.** The Silinx toolchain is developed for the Spartan-3E: the XC3S250E (Basys2-250) first,
then the other Spartan-3E boards (XC3S100E, XC3S500E, XC3S1200E: their bit databases share the
tile types' bits with the XC3S250E's; research/s3e-bitstream/README.md, stage F). **The Spartan-6 boards** (Nexys3,
Atlys) are under development behind a developer flag (`SILINX_SPARTAN6_OPEN=1` in the server's environment; the
users still build them with ISE): there the Silinx toolchain synthesizes, maps, places, routes, times and writes the
bitstream of a design for the XC6SLX16 and the XC6SLX45 (#732). Its bit database (`packages/silinx-fpga/bitdb/s6`)
was measured the same way against ISE 14.7's bitgen; the seven examples on both boards, routed by the Silinx
toolchain, give byte for byte the bitstream ISE's bitgen writes for the same routing, which ISE's DRC finds no error
in, and its static timing is fitted to ISE's trce (each constraint within 5 % of its slack or 2.5 % of the period,
#731). What it does not cover yet: a DCM's or PLL's configurations beyond the ones measured (#2025), and the boards
in the IDE without the flag ([#1](https://github.com/pmnmalo/Silinx-ISE/issues/1); the plan and the results:
[research/s6/README.md](../research/s6/README.md)).

## Method: observation of a tool's behaviour (black-box)

The bit database is built the same way the open-source projects for other FPGAs built theirs:
Project X-Ray (Xilinx 7-series, with Vivado), Project IceStorm (Lattice iCE40) and Project Trellis
(Lattice ECP5).

1. Silinx writes many small test designs that differ in a single feature (for example, one LUT
   memory bit, or one routing switch on or off). They are written in XDL. XDL is the text design
   format that ISE documents and provides so that users can write their own tools; ISE's own
   help says it enables all users to write tools.
2. ISE's command-line tools are run on these designs as an ordinary user would run them:
   `xdl -xdl2ncd` (XDL → design) and `bitgen` (design → bitstream).
3. The resulting bitstreams are compared. The bit that changes between two designs is the bit
   that holds the feature that changed.
4. The results are recorded as facts about the chip: "LUT F of slice X31Y47, address 0, is bit
   736 of frame 236, stored inverted".

The format of the bitstream's packets, registers and frames is taken from Xilinx's public
documentation: the Spartan-3 Generation Configuration User Guide (UG332) and XAPP452.

### What the project does not do

- **No decompilation or disassembly** of ISE or of any Xilinx program. Its executables and libraries
  are never examined.
- **No reading of ISE's internal data files** (for example the device databases in ISE's
  installation directory). Only the documented outputs of ISE's command-line tools are used.
- **No Xilinx code, and no Xilinx data files, in Silinx.** The bit database is Silinx's own record
  of observations. It does not contain any file produced by Xilinx. The device descriptions shipped
  for the Spartan-3E boards' devices (XC3S100E-CP132, XC3S250E-CP132, XC3S500E-FG320,
  XC3S1200E-FG320) and the Spartan-6 boards' (XC6SLX16-CSG324, XC6SLX45-CSG324) are Silinx's own packed descriptions of the chips' wires and switches
  (`packages/silinx-fpga/src/fpga/device.js`), computed from the output of ISE's documented `xdl -report -pips
  -all_conns` command; it is neither that report nor any file of ISE's installation.
- **No redistribution of ISE.** The Docker image with ISE that Silinx's developers use is private
  and is never published. Users of Silinx install ISE themselves, under its own licence, if they
  need it.
- **No circumvention of any protection.** Bitstream encryption, readback protection, licence
  checks and any other protection measure are not studied, used or bypassed.
- **No confidential information.** Only public documentation and the behaviour of the tools are
  used.

### Records

- The test designs, the scripts that generate and compare them, and the tool versions used
  (ISE 14.7, `xdl` P.20131013, `bitgen`) are kept in the repository under `research/`, so the
  database can be regenerated and checked by anyone with a lawful copy of ISE.
- Each database file states how it was obtained: which experiment, which tool versions, and when.
- This document and the repository history are the record of the method over time.

## Legal basis (EU and Portugal)

The method relies on the following provisions. They are listed for a lawyer to check.

- **Directive 2009/24/EC on the legal protection of computer programs, Article 5(3):** a person
  who has the right to use a copy of a program may, without the rightholder's authorisation,
  observe, study or test how the program functions, to find the ideas and principles that
  underlie any element of the program. This applies while the person is loading, displaying,
  running, transmitting or storing the program, which they are entitled to do. Running ISE on test
  designs and comparing what it produces is this kind of observation.
- **Article 1(2) of the same Directive:** ideas and principles, including those underlying a
  program's interfaces, are not protected by copyright. Which bit of the chip configures which
  feature is a fact about the hardware and its interface, not an expression of ISE's code.
- **Article 8 of the same Directive:** contract terms that conflict with Article 5(3) (or with
  Articles 5(2) and 6) are null and void. A licence clause that prohibits reverse engineering
  cannot remove the right to observe, study and test a program the user lawfully runs.
- **Article 6** (decompilation for interoperability) is **not** relied on, because no decompilation
  is done.
- **Portugal:** the Directive's rules are part of Portuguese law through Decreto-Lei n.º 252/94
  (legal protection of computer programs).
- **Lawful use of ISE:** ISE 14.7 WebPACK is used under the licence it is distributed with, by
  people who installed it and accepted that licence.
- **Hardware:** the boards the experiments run on are owned by their users. Configuring hardware
  one owns, with tools of one's choice, is the purpose of this work.

## Trademarks

Xilinx, ISE, Spartan, Vivado and Basys are trademarks of their owners (AMD and Digilent). Silinx
uses these names only to say which products it works with. It is not affiliated with AMD, Xilinx
or Digilent, or endorsed by them.

## Open questions for the legal review

- Whether publishing the bit database (facts about the Spartan-3E devices) needs any further care, for
  example under the EU sui generis database right. The database is created by Silinx itself, from
  its own experiments.
- Whether the device description computed from `xdl -report` (the chip's tiles, sites, wires and
  routing switches) may be redistributed. Project X-Ray publishes the equivalent description of
  the Xilinx 7-series chips, obtained from Vivado. The author decided (2026-10-11) to ship it for
  the devices of the Spartan-3E boards Silinx supports (XC3S100E-CP132, XC3S250E-CP132,
  XC3S500E-FG320, XC3S1200E-FG320), so that the Silinx toolchain works without ISE on them; the
  same was done for the two Spartan-6 boards' devices (XC6SLX16-CSG324 of the Nexys3, XC6SLX45-CSG324 of the
  Atlys) on 2026-10-21, for the Spartan-6 toolchain under development
  ([#723](https://github.com/pmnmalo/Silinx-ISE/issues/723)); for
  every other device each user builds it from their own ISE installation. Measuring it instead by
  black-box observation, as the bit database is, would remove the question: the method and a first
  prototype on the XC3S250E's CLB array are in
  [research/s3e-device/README.md](../research/s3e-device/README.md)
  ([#3](https://github.com/pmnmalo/Silinx-ISE/issues/3)).

## Author

Silinx and this toolchain are the work of Pedro Maló, done in his own time (see NOTICE).
