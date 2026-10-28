In detail:

- **The release zip without a link to the workspace package (#1874):** since packages/silinx-fpga became an npm
  workspace (#1677), `npm ci` in the release's folder linked it into node_modules, and the release zip's test found
  silinx-fpga among the third-party dependencies (the v15.19.0 tag's CI). scripts/package-release.mjs now removes
  npm's links to this repository's own packages, which are in the zip as files (packages/) and not third-party (a
  symbolic link is no use in a zip unpacked on Windows). Test: test/release/release.test.js (the package's files in the
  zip, no link in node_modules; it failed without the change).
