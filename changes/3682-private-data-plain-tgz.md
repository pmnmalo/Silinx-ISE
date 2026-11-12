In detail:

- **The private-data check reads a `.tgz` with no tar inside (#3682):** `scripts/check-private-data.mjs` scans a
  `.tgz` that is a plain gzip stream as a `.gz`'s content (it was read as a tar and passed with nothing found), and
  refuses a `.tar` with no header at all as an archive it cannot read. A real tarball, and an empty one, are read as
  before. Test: private-data.
