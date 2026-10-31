In short:

- **A new example, isqrt:** a module written in C and made into hardware by Silinx HLS: the integer square root of the switches, on the display, with its C test bench.

In detail:

- **The example isqrt (#1966):** a C function (`src/isqrt.c`, a loop of a count the data decide, a pointer output, `ap_uint`) instanced by a VHDL top with the display, its HDL generated with no file of its own; C simulation, C/RTL co-simulation and the display's test bench, on every device of the Silinx toolchain. The examples' tests make a C module's HDL as the application does.
