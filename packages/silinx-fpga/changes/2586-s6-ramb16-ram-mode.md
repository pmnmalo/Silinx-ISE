In detail:

- **A RAMB16BWER's two RAM_MODE bits in the Spartan-6 bitstream (#2586):** `s6/bitgen.js` `bramRewrites` clears bit 0
  of word w and bit 15 of word w + 15 of minor 23 (the bits `RAM_MODE=SP` clears) only for a RAMB16BWER whose XDL has
  no `RAM_MODE`, as Silinx's own XDL, and for every such block RAM, not only the first. One with `RAM_MODE::TDP`, as
  ISE's map writes it, keeps them, as ISE's bitgen does. The 5 RAMB16BWER designs of #728 that ISE implemented
  (XC6SLX16 and XC6SLX45), 2 bytes off before, are byte-identical with ISE's `.bit`, and so are #728's other 9 and
  stopwatch's on the Nexys3 and the Atlys (`check-bitgen6.mjs`); the XC6SLX16's 23 XDL RAMB16BWER designs too (none
  before). The open flow's `.bit` is unchanged. Test: packages/silinx-fpga/test/s6-bitgen.test.js.
