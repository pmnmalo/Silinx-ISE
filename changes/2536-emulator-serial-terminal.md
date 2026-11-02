In short:
- Board Emulator: a serial terminal for the boards' serial ports (RS-232, USB-UART, the iCEBreaker's UART): what the design sends is shown, and a line typed is sent to it.

In detail:
- Board Emulator: the Serial terminal, a module outside the board (shown or hidden with the others) when the UCF wires the board's serial port. The compiled engine records each change of the TX pin, and the terminal decodes it as UART frames (8N1, from 1200 to 115200 baud). A line typed is sent to the RX pin as frames in the board's time, its end a CR. The RX input rests at 1 (#2536).
