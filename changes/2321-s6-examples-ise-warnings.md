In short:

- The examples build with ISE on the Nexys3 and the Atlys with no warning: their counters are as wide as they need,
  and the stopwatch keeps up to 1023 laps (in a whole block RAM) instead of 512.

In detail:

- **The examples on the Spartan-6 with ISE: no warning (#2321):** XST on the Spartan-6 trimmed the counter bits that
  are always 0 (`Xst:1293`, `Xst:1896`) and map warned of the stopwatch's 9K block RAM (`PhysDesignRules:2410`). The
  button debouncers of clock and pong count in 20 bits (24 before), pong's step and beat counters in 23 (24), blinky's
  ASM chart's `ticks` register in 7 bits (8; `speed_ctrl.vhd` generated again), and the stopwatch's lap memory holds
  1023 times in 1024 words (512 x 14 took a RAMB8BWER, 1024 x 14 a whole RAMB16BWER; on the Spartan-3E one RAMB16
  either way). The open toolchain's netlists of clock, pong and blinky are smaller; the stopwatch's 2 LUTs larger on
  the Spartan-3E (its Speed mapping 28), 3 on the Spartan-6.
  test/ise/examples.test.js builds every example with ISE on the Nexys3 and the Atlys too, with no warning, and
  test/ise/xise-interop.test.js expects none on the Nexys3; test/synth-brams-s6.test.js keeps a 512 x 14 memory of
  its own for the open synthesis's 9K rule (#2130).
