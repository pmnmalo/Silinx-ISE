In short:

- **Board Emulator:** the Basys 3 and the Nexys A7 are drawn as the real boards: the switches, buttons, LEDs and
  digits where they are on the board (the Nexys A7's 8 digits and its CPU RESET button), the connectors on their
  edges, the silkscreen's names with the FPGA pins.

In detail:

- **The Basys 3 and the Nexys A7 drawn in the Board Emulator (#3706):** `web/js/emulator-basys3.js` and
  `web/js/emulator-nexys-a7.js`, registered in `BOARD_LAYOUTS`: the PCB with LD15..LD0 over SW15..SW0 along the bottom
  edge, the cross of five buttons, the 4-digit (Basys 3) or two 4-digit displays (Nexys A7), the VGA, USB-UART, USB
  host and Pmod connectors, no maker's logo; I/O Pin Planning's Board view draws them too. The UI tests check each
  board's size and parts, where they are, that each control is what sits at its centre, in both interfaces and in
  Portuguese.
