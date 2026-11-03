In short:

- **micro80 on the Nexys3 and the Atlys:** the Silinx toolchain builds its bitstream, with no warning; every example
  now runs on the Spartan-6.

In detail:

- **The Spartan-6's bitstream with two or more block RAMs (#2679):** the open flow's bitgen refused micro80 ("2 block
  RAMs: the frame bitgen writes again measured with one"). It now writes the frames ISE's bitgen writes again for any
  number of block RAMs (packages/silinx-fpga), byte-identical with ISE's on micro80 on both boards. micro80 joins
  `S6_EXAMPLES` (test/examples-lib.mjs): test/examples.test.js builds it on the Nexys3 and the Atlys with no warning,
  test/s6-xdl.test.js takes a SLICEM's distributed RAM settings (its register bank), and test/ise/examples.test.js
  expects ISE's Spartan-6 warnings on it (test/ise-micro80-warnings.mjs, checked on both boards); its open-flow check
  against ISE is known to fail on ISE's DRC (the register bank's RAM32M, #2755).
