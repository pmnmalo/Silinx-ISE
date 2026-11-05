In short:

- A C function made of a hand-written VHDL or Verilog module (Silinx HLS's RTL blackbox) builds on the boards, with
  the Silinx toolchain and with ISE, with no warnings: the blackbox's C model is no longer taken for a module of the
  design, and XST no longer warns of constant flip-flops in the machine around the module.

In detail:

- **The RTL blackbox through synthesis (#2341):** the blackbox (#1903) had been checked by co-simulation only. A project
  with one did not build: its C model (the description's `c_files`, the C simulation's) was made a module of its own,
  refused ("'adder' is the top function", #2854). `blackboxModels` (`core/c-blackbox.js`) lists the C models the descriptions
  name, and the build leaves them out, on the server (`viewSources`, the Silinx toolchain and ISE) and in the browser
  edition. An HLS module calling a module in the other language (a VHDL machine and a Verilog module, a Verilog machine
  and a VHDL module, `test/fixtures/hls-blackbox`) builds with the Silinx toolchain on every device of the examples,
  and with ISE (XST), with no warnings.
  - **The output's capture (#2862):** an output with a valid was captured, for a valid before `ap_done`, in registers
    `ap_done` cleared first: with the usual module, its valid with `ap_done`, the capture never happened, and XST
    trimmed it with a warning per bit (Xst:1710, Xst:1895). It is now taken on every valid and forgotten as the next
    call starts, that start's cycle reading the valid alone.
  - **The corpus against Vitis HLS:** misc-rtl-as-blackbox run again through Vitis HLS 2025.2: its C simulation,
    synthesis and co-simulation pass, Silinx's ports the same as Vitis's, a latency of 5 cycles to Vitis's 4
    (`test/hls-corpus/vitis.json`, the README's table). `scripts/hls-vitis.mjs` synthesized the design without its
    blackbox descriptions to compare the ports: it now takes the options the corpus runs with (`optionsOf`,
    `test/hls-corpus/lib.mjs`, #2855).
  - **Tests:** test/hls-blackbox-flow.test.js (the C model not a module; the C simulation and co-simulation; the
    Silinx toolchain on the six boards, no warnings), test/ise/hls-blackbox.test.js (ISE on the six boards, no
    warnings; opt-in), test/hls-vitis.test.js (a blackbox design's ports compared), test/c-blackbox.test.js (the capture; calls
    of a combinational module whose valid is 0 on some, none reading the last capture), test/ui/c-source.test.js (the
    C model no row of the Design pane, no error).
