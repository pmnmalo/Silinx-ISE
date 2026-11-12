In short:

- **The Board Emulator on the Basys 3, the Nexys A7, the ULX3S and the Tang Nano 9K:** a project on a 7-series, ECP5 or
  Gowin board has Emulate on Board and the Tasks interface's Emulate: the design runs on the board's generic panel, wired by
  its XDC, LPF or CST.

In detail:

- **Emulate on the 7-series, the ECP5 and the Gowin (#3704):** the Silinx toolchain's 7-series flow, AMD Vivado's, the
  ECP5's, the Gowin's and the experimental family's no longer leave out Emulate on Board and the Emulate task: the emulator
  runs the HDL, not the bitstream, on the board's resources and the constraints' pins, which it already read in every format.
  Emulate on Board lists the models the flow generates (`simModelsOf`): the RTL model only on the flows with no simulation
  models (the iCE40's too). Tests: every example on the Basys 3, the Nexys A7, the ULX3S and the Tang Nano 9K on both engines,
  its warnings the wizard's (the ULX3S's four switches missing for isqrt and micro80); gates' switches and stopwatch's
  buttons on the display; a Basys 3 project's Emulate on Board, toolbar step and Tasks interface's Emulate, the emulator
  reacting, in Portuguese, in both interfaces.
