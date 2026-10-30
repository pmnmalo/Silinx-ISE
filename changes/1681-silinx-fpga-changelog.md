In detail:

- **silinx-fpga's own changelog (#1681):** step 10 of the toolchain's separation (#1651): the package gets its
  CHANGELOG.md and its fragments, packages/silinx-fpga/changes (the format of changes/; its first one, the
  package's first version). scripts/changelog-release.mjs and scripts/sync-version.mjs take `--package
  silinx-fpga`: its fragments assembled into its CHANGELOG.md, its version checked against it (no version.js
  written); CLAUDE.md and ONBOARDING.md say where a change's fragment goes. Tests:
  test/changelog-fragments.test.js (the package's fragments and changelog; both scripts with --package, their
  errors, the IDE's changelog untouched).
