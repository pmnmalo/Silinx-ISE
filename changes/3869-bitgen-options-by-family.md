In short:

- **ISE makes the bitstream of a Spartan-3A or Spartan-3 board.** ISE's build for the Numato Elbert V2 or the
  Spartan-3 Starter Board stopped at the bitstream: bitgen refused an option Silinx gave it.

In detail:

- **ISE's bitgen options by family (#3869).** Silinx gave every Spartan-3 family the same bitgen options. The
  Spartan-3A's and 3A DSP's bitgen has no `DCMShutdown` (`ERROR:Bitgen:38`), and the Spartan-3's takes no
  `ConfigRate:1` (from 3 MHz); the Zynq's has no `DebugBitstream`. They now get only what their bitgen takes: no
  `DCMShutdown` on the Spartan-3A and 3A DSP, `ConfigRate:6` (its default) on the Spartan-3, no `DebugBitstream` on
  the Zynq. The Spartan-3E's options are unchanged. A test checks every option Silinx writes against each family's
  `bitgen -help` of ISE 14.7, and ISE builds the clock example for the Elbert V2 and the Spartan-3 Starter Board.
