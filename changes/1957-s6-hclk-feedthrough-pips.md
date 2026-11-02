In detail:

- **Spartan-6: the clock PIPs of the block RAM and DSP columns' clock rows measured (#1957):** a Nexys3 or Atlys
  design with a block RAM or DSP in the lower half of a clock row (and the Atlys's folded clock tiles) no longer has
  bits of its clock routing that the Silinx toolchain's bit database lacks. Test: test/s6-cmtsites.test.js.
