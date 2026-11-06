In short:

- The Board Emulator's VGA monitor no longer says "No VSYNC" on a slow computer while the first frames are still being
  simulated.

In detail:

- **No VSYNC only once 100 ms of the design ran with no frame (#2898).** The monitor said its warnings once they had
  lasted a second of real time; on a slow machine the first two VSYNC pulses (about 33 ms of the design's time) may take
  longer, and it said "No VSYNC: the monitor finds no frames" for a design that has them. `core/vga.js` now waits for
  100 ms of the design's time, as for a VSYNC that stopped.
  - **Tests:** test/vga.test.js (no warning after one frame, the warning once 100 ms ran with no VSYNC).
