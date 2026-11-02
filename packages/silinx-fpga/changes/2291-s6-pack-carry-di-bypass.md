In detail:

- **The Spartan-6 packer: a carry's DI the same net as its S (#2291):** when S is a LUT's output, its DI takes the
  bypass input (AX … DX), as phys.js routes it, and the packer now reserves that input, so no flip-flop of the
  position takes it for its D (the physical design stopped at "its pin AX carries … and …" on a small design). Test:
  test/s6-pack.test.js.
