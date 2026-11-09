In detail:

- **The nextpnr and Yosys update comparisons measure the base's package on the base's side (#3156):**
  `nextpnr-update.yml` and `yosys-update.yml` installed the base's package at the repository's root only, and npm kept
  the pull request's nested in `packages/silinx-fpga/node_modules`, which the toolchain resolves first: both sides
  measured the pull request's package. The base's is now installed into the toolchain's workspace and the root both,
  and a step on each side prints the version resolved from `packages/silinx-fpga` and from the root and fails when it
  is not the side's (`scripts/resolved-package.mjs`).
