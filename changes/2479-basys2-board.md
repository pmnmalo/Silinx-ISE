In short:
- The Board Emulator draws the Basys2 as the real board: royal blue, the Pmods JA..JD along the top edge, the PS/2 and mini-USB on the left edge, the upright power switch SW8 in the bottom-left corner, the VGA on the right edge, LD7..LD0 over the big slide switches SW7..SW0, the display over BTN3..BTN0, with the board's names and FPGA pins (SW0-P11, BTN0-G12, AN0(F12), the Pmods' pins).

In detail:
- The Basys2's drawing (`web/js/emulator-basys2.js`) redone after the board's photos and reference manual: the board 840 x 556 (its proportions); every part where it is and as it is turned; the silkscreen's names with the pins from the board's resources; the STATUS LED by the power switch; the board's name (BASYS 2), not its makers' names or logos. The drawing's small helpers (`svgText`, `ic`) and the upright power switch's style (`POWER_V_CSS`) moved to `web/js/emulator-pcb.js`, shared with the Spartan-3E Starter Kit's (#2479).
