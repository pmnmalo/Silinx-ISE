In short:
- A new example, uart: serial communication with a terminal. It echoes what it receives and shows it on the display and the LEDs, and a button sends a message. It runs in the Board Emulator's Serial terminal.

In detail:
- The uart example (VHDL): a receiver and a transmitter (8N1, 9600 baud at 50 MHz, the generics `CLK_HZ` and `BAUD`), a self-checking testbench, on every board's serial port (#2537).
- The Basys2 has no serial port: its UART is on the Pmod JA, as a PmodUSBUART (JA2 and JA3, the JA resource keeps JA1 and JA4). Not verified on a board yet (#2537).
- Known limit: the example has no bitstream on the Atlys with the Silinx toolchain yet, its USB-UART pins using two features the bit database has not measured (#2539).
