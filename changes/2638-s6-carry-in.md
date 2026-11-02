In short:

- Spartan-6 (Nexys3, Atlys): an adder with a carry in signal (`a + b + c`) builds with the Silinx toolchain.

In detail:

- **Spartan-6: a carry chain's carry in and its first data input (#2638):** both used to need the slice's bypass input
  AX, and the implementation stopped with "its pin AX carries … and …". The first data input now goes through the LUT's
  O5, as ISE's map does it (packages/silinx-fpga/changes/2638-s6-carry-in-di0.md). Tests: test/s6-pack.test.js,
  test/s6-xdl.test.js.
