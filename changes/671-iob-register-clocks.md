In short:

- **Registers in the IOBs of every pad with the Silinx toolchain:** an I/O register on a left, right or top pad
  (IOB = TRUE) is clocked from the global clock lines as ISE clocks it, and its bitstream is byte-identical to ISE's.

In detail:

- **The I/O registers' clocks (#671):** the left and right I/O tiles' clock pins from every global line (only line 4
  was measured) and the horizontal clock rows of the I/O columns (GCLKH_PCI_CE_S / _N: GCLKH's switches, 2 frames
  further in the left column; the writer had set them 2 frames early there), measured with ISE (`measure-671.sh`:
  designs with IDDR2 / ODDR2 on every pad clocked from each of the 8 top and bottom buffers, every PIP removed by
  codewords, on the XC3S100E, XC3S250E and XC3S1200E; `measured/learn-16iob-clk-lines.json`, the layouts' `typeCols`).
  The router reaches an I/O register's clock pin from the global lines only, as ISE does (the clock search takes the
  tile's IOIS_CLKj on its way; B4's register came through general routing), and the packer keeps out of the IOB a
  register whose clock is not on a global buffer, with a warning. Two kinds of bits of the pads' own features (#44 /
  #96's solution) corrected with ISE: the clock rows' bits one pad of each row held for the writer's error
  (`pad-clock-rows.mjs`), and the bits of `R:ICLK2INV:#OFF` given to the pad they belong to, not the other pad of the
  tile or one of the next (the 3,71 ISE sets for B4 had gone to C4: `pad-owners.mjs`,
  `measured/fix-27iclk2-owners.json`); 5 bits of an input delay stay open (#751). Two registers of one I/O tile on different clocks do not route (#749).
  `feat_iob_plain` has its registers on pads of the four sides, `feat_iob_lines` (new) clocks left and right IOB
  registers from each of the eight lines: DRC clean and byte-identical to ISE's bitgen on the four devices.
