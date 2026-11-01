In short:
- The Board Emulator draws the Nexys2 as the real board: the 5 V jack and the upright power switch on the top edge with JA..JD and RESET, VGA, RS-232, USB and PS/2 down the left edge, the FX2 connector on the right edge, LD7..LD0 over SW7..SW0 and the display over BTN3..BTN0 at the bottom, with the board's names and FPGA pins.

In detail:
- The Nexys2's drawing (`web/js/emulator-nexys2.js`) redone after the board's photos and reference manual: the board 860 x 720 (its proportions); every part where it is and as it is turned (the Pmods 2 x 6 with their power jumpers, the power select jumper, the clock socket IC7, the 50 MHz oscillator, JP8); the silkscreen's names with the pins from the board's resources; the board's name (NEXYS 2), not its makers' names or logos. The helpers no board uses any more (`pmod`, `pmod12`, `db`, `chip`) left `web/js/emulator-pcb.js` (#2480).
