In short:

- **EDGE Spartan 6 board:** the EDGE Spartan 6 (XC6SLX9-TQG144, 50 MHz) is in the boards list, with its LEDs,
  switches, buttons, 7-segment display, VGA, UART and other I/O.

In detail:

- **The EDGE Spartan 6 board (#3873):** a board entry from the vendor's master UCF (rev 3.2) and User Manual v3.1:
  XC6SLX9-2-TQG144, 50 MHz on P84, FT2232H USB JTAG and USB-UART, W25Q80DV SPI flash. Its LEDs share pins with the
  7-segment display and the LCD, so LEDs D2..D9 and the display are its resources and `deviceNotes` lists the
  shared pins. The clock, 7-segment, LED and button resources and openFPGALoader (cable ft2232: SRAM load and SPI
  flash) were checked on a real board.
