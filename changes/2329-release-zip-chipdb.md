In short:

- **A smaller download:** the release zip no longer carries nextpnr's chip databases. The first Place & Route of a device with
  the nextpnr engine downloads its database (2 to 6 MB) and keeps it, so that first run needs the Internet; the Silinx
  engine needs nothing.

In detail:

- **The release zip within its 40 MB budget (#2329):** `scripts/package-release.mjs` replaces the nextpnr packages' databases
  by a manifest (`chipdb/fetch.json`: the fork's release, each file's size and SHA-256) and leaves out the tests (`test/`,
  `packages/silinx-fpga/test/`), which the app does not read. The local server's flow downloads a device's database on its
  first use, checks it against the manifest and keeps it in `~/.silinx/nextpnr/`; the log says so, and offline the error
  says what to do. test/release/release.test.js checks the zip.
