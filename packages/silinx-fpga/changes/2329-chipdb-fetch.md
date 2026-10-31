In detail:

- **nextpnr's chip databases on first use (#2329):** `nextpnrNode()` and `nextpnrS6Node()` download a database their package
  does not have, when its `chipdb/fetch.json` says where (Silinx ISE's release zip leaves them out), check its size and
  SHA-256 and keep it in `~/.silinx/nextpnr/`. An installation from npm has them all, and nothing changes. The module:
  `src/nextpnr-chipdb-node.js`, tested by test/nextpnr-chipdb.test.js.
