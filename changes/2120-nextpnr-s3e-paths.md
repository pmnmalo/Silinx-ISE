In detail:

- **The nextpnr spike's commands on their new paths (#2120):** after the move into the toolchain package (#2111),
  packages/silinx-fpga/research/nextpnr-s3e's README and its scripts' usage lines named `research/nextpnr-s3e/…` and
  `research/s3e-route/check.mjs`, which no longer exist; they now name `packages/silinx-fpga/research/…`.
  packages/silinx-fpga/test/nextpnr-s3e.test.js checks that every script they name exists.
