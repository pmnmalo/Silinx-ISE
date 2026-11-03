In short:

- **I/O Pin Planning on the board:** a Board view beside the table draws the board as the Board Emulator does; drag
  the design's ports onto its LEDs, switches, buttons and displays to set their pins, a bus spread over a row.

In detail:

- **I/O Pin Planning: a Board view, the ports dragged onto the board's parts (#2694):** Table and Board in the
  toolbar; the Board view draws the project's board with the Board Emulator's layouts (Basys2, Nexys2, Nexys3, Atlys,
  Spartan-3E Starter Kit, iCEBreaker; another board as rows of LEDs, switches and buttons), the top-level ports beside
  it, dragged with the mouse or a finger. A bus spreads over the row from the part dropped on (moved back to fit
  it); on a digit of the 7-segment display, 7 bits take the segments CA..CG (8 with DP), as many bits as anodes the
  anodes, one bit the digit's anode; the resources the drawing has no part for (clocks, VGA, PS/2, the serial port,
  the Pmods, the segments) are chips under it. A part shows the bit placed on it; a part another port has is taken
  from it; a port dropped again moves. Warned, under the board and in the console: an output on an input of the
  board (a switch, a button), an input on an output (an LED), a bus wider than the row (the bits left unplaced).
  Undoable; the table and the UCF the same assignments (core/pin-board.js).
