In short:

- The Silinx toolchain places a one-bit bus port (`std_logic_vector(0 downto 0)`, `NET "btn<0>"` in the UCF) on the
  pin its constraints give: the traffic example's button and the vga example's switch were on other pins.

In detail:

- **The Silinx toolchain: a one-bit bus port's UCF pin (#2199):** its `LOC` and `IOSTANDARD`, written `btn<0>` (or
  `btn(0)`), were dropped by the packer, which chose a pad of its own; the toolchain's package fixes it
  (packages/silinx-fpga/changes/2199-one-bit-bus-loc.md). Tests: test/ucf.test.js, test/iob-pack.test.js.
