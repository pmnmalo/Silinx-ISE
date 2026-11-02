In short:

- **A new example, micro80:** a microprocessor (light8080, compatible with the Intel 8080) running a program from block
  RAM: it multiplies the two numbers of the switches and shows the product on the display.

In detail:

- **The micro80 example (#2544):** `examples/micro80`: the light8080 core as it is (LGPL-2.1), a memory of 1 KB, ports, and
  a hand-assembled program with its listing; a self-checking testbench, and the program checked on every position of the
  switches against the product computed apart. ISE builds it with XST's warnings on the core's unused parts (its
  interrupt tied off, microcode fields, a DAA test), recorded as expected: an exception to the examples' rule of no
  ISE warnings, the maintainer's decision, so that the core stays as its author wrote it. The Spartan-6 refuses it
  until #1153.
