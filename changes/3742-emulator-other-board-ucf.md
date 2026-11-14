In short:

- **Board Emulator: constraints of another board.** When the constraints' pins are not on the project's board (the
  board changed, Update Constraints declined), the Board Emulator says so and offers to regenerate them from the board's
  pin table, as Implement does, instead of running with its inputs held at 0.

In detail:

- **Board Emulator: constraints made for another board said, their regeneration offered (#3742).** Before it runs, the
  emulator checks the constraints' pins against the board with Implement's check (`boardConstraints` in
  web/js/implement.js, Implement's `checkConstraints` now calls it): a warning lists the pins that are not on the board,
  and the dialog Constraints do not match the board offers to regenerate them; declined, the emulator does not run and
  says why. A port is the serial terminal's only in the serial pin's direction (core/uart.js `uartBit`): an input on
  the board's TX pin (the Basys2's clock pin B8 on a Numato Mimas V2) is no longer taken as the terminal's RX, nor held
  high as an idle RX.
