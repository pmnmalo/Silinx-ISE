# The history of Silinx

Who started Silinx, why, and how it came to be what it is. Written for the people who join the project, so they
know where its rules and its choices come from.

## Who

Silinx was started by **Pedro Maló**, who teaches Digital Systems at **FCT NOVA** (NOVA School of Science and
Technology, Lisbon). He is the project's maintainer: he decides what it does, reviews and merges its pull requests and
makes its releases ([CONTRIBUTING.md](../CONTRIBUTING.md)).

## Why

The Digital Systems courses teach FPGA design on Spartan-3E boards, the Digilent **Basys2** and **Nexys2**, with the
tool made for them: Xilinx **ISE 14.7** and its Project Navigator. That tool has been discontinued by AMD/Xilinx for a
long time. It no longer installs cleanly on today's operating systems (none on macOS, not natively on Apple silicon,
awkwardly on recent Windows and Linux), it is a heavy download for a student's laptop, and nothing in it will be fixed.
The boards, on the other hand, still work, are in the labs, and teach the subject well.

Silinx was made so the courses could go on with those boards without depending on a tool nobody maintains:

- **the same way of working as ISE**: a Project Navigator that students and teachers already know, the same projects
  (`.xise` import and export), the same processes and reports, so the course material stays valid;
- **for teaching first**: messages a beginner understands, design checks, the drawings of the first-semester courses
  (schematics, ASM charts, state machines, truth tables, Petri nets) that generate their VHDL or Verilog, simulation
  in the tool itself, a Portuguese interface;
- **runs anywhere**: in the browser or as a local server, with nothing to install, and programs the board from the
  browser;
- **its own open toolchain**, so that ISE becomes optional: synthesis, place and route, and a bitstream that ISE
  itself would write, byte for byte.

## The name

The project began as **XAIlinx** and became **Silinx** the next day. *Silinx* = **SI** + **linx**: **SI** for *Super
Intelligence*, because the tool was written by an AI, and **linx** for the programmable links of an FPGA, the
interconnect that the designs made with it configure. Its version numbers start at **15**, as the next version of
ISE 14.7 would have. Silinx is independent: it is not affiliated with, endorsed or supported by AMD/Xilinx.

## Built with AI

Silinx is written with **Claude Code**: Pedro sets the direction, files the issues, tries the tool on the boards and
reviews; Claude sessions write the code, the tests and the documentation. From the start several
sessions have worked in parallel, each in its own worktree on its own issue, with one session coordinating the merges.
Most of the project's rules come from that way of working:

- every change has an issue and its own tests, and asserts the expected warnings too, because a test is what tells a
  later session that a change broke something;
- small modules and functions (#405), so that a session reads only what it changes;
- a changelog fragment per change instead of one CHANGELOG.md, because parallel pull requests kept conflicting on it;
- the related tests on a pull request and the full suites at a release only (#607), so that many sessions can work at
  once on one machine;
- ISE as the oracle of the open toolchain: a byte-identical `.bit`, because an AI's toolchain must be checked against
  the reference, not trusted.

[ONBOARDING.md](../ONBOARDING.md) holds the lessons learnt along the way.

## Timeline

- **2026-10-06**: the first version, *XAIlinx*: a Project Navigator in the browser, mixed VHDL / Verilog projects, its
  own parsers, elaborator and simulator, RTL schematics and ASM charts, the ISE flow (local, Docker or SSH), board
  programming, the standalone single-file edition, the Portuguese interface.
- **2026-10-07**: renamed *Silinx ISE*; version 15.0.0, the first release with CI.
- **2026-10-10**: the open Spartan-3E toolchain begins ([OPEN-TOOLCHAIN.md](OPEN-TOOLCHAIN.md)): Yosys synthesis,
  then Silinx's own pack, place, route and bitstream writer, checked against ISE's `.bit`.
- **2026-10-12**: the browser edition programs the board over WebUSB.
- **2026-10-13**: the Petri net editor, after the schematics, ASM charts, state machines and truth tables.
- **2026-10-18**: the MCP server: what the interface does, an AI assistant can do too (#134, then #2674).
- **2026-10-26**: C to HDL, a C specification compatible with Vitis HLS.
- **2026-10-28**: contributors from outside: the maintainer merges and releases, a code owner reviews (#1872).
- **2026-10-29 onwards**: place and route move to **nextpnr** (#2137): Silinx's own placer and router were removed
  once nextpnr reached parity (#2137, #2824); the Spartan-6's packer and the bitstream writer stay Silinx's.
- **2026-11-08**: renamed *Silinx* (#2624): the app, its command (`silinx`) and its release files.

The [CHANGELOG](../CHANGELOG.md) has every release in detail.

## What comes next

Silinx is used in Pedro's courses at FCT NOVA and is open (AGPL-3.0-only) so that other teachers and students can use
it and contribute to it. New contributors are welcome: start with [CONTRIBUTING.md](../CONTRIBUTING.md), then
[ONBOARDING.md](../ONBOARDING.md) and [CLAUDE.md](../CLAUDE.md).
