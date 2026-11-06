In detail:

- **The nextpnr update's step outputs checked (#2959):** `scripts/nextpnr-update-report.mjs versions` refuses a version
  resolved by a pull request's (or the base's) `package-lock.json` that is not of a version's shape (`VERSION_SHAPE`, as
  the Yosys update's), and every value it and `scripts/yosys-update-report.mjs` write to `$GITHUB_OUTPUT` goes through one
  helper (`githubOutputLines`) that refuses a line break.
