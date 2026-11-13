In short:

- **The examples keep time on every board.** A project made from an example for another board takes the board's
  clock and the level of its buttons and switches. On a 100 MHz board (Nexys3, Atlys, Mimas V2) the clock example
  counted two seconds per second and VGA ran at twice its pixel rate. On the Numato boards the switches held the
  clock in reset and the buttons acted on release. Both are fixed.

In detail:

- **The examples' clock as a generic, their counters sized by it (#3710).** Each clocked example's top has a `CLK_HZ`
  generic (50 MHz, the Basys2's), and its timing generics default from it (`TICK := CLK_HZ`, `STABLE := CLK_HZ / 50`,
  `REFRESH := CLK_HZ / 1000`…). The values at 50 MHz are the ones before, and the test benches still set them. The
  Verilog counters (the clock's tick, pong's step, the debouncers', the displays') are sized by a constant `clog2`
  function. vga's `vga_sync` makes its 25 MHz pixel enable from a `DIV` generic. blinky's ASM chart has 21-bit
  debounce counters (2 000 000 cycles at 100 MHz).
- **The inputs' level as a generic (#3710).** `BTN_LOW` and `SW_LOW` (false: the Basys2's) invert the buttons and
  switches where a board's read 0 when pressed or on (the Mimas V2's, the Elbert V2's, now marked active low).
- **A project for another board gets the board's values (#3710).** New Project from an example for another board
  (the server, the browser edition and the MCP server's `new_project_from_example`), Design Properties' board change
  and `set_design_properties` write the board's clock and levels as the defaults of the top's generics
  (core/board-generics.js). The console says so, and Undo gives the file back.
