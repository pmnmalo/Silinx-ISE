In detail:

- **The Yosys and nextpnr updates' `check` jobs: the base at the workspace's root, the pull request under `head/` (#3038):** the job whose token labels the pull request runs the base's `scripts/…-update-report.mjs versions` on
  the base's package files and on `head/package.json`, `head/package-lock.json`, after a step that checks no
  `node_modules` is at the root: a bare import of the base's script never resolves into a tree of the pull request
  (`yosys-update.yml`, `nextpnr-update.yml`; test/workflows-lib.mjs `checkoutLayout`).
