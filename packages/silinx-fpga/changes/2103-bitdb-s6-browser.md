In detail:

- **The Spartan-6's bit databases from any reader (#2103):** `src/fpga/s6/bitdb.js` makes the object `predictDesign`
  reads from the files' contents: `bitDbS6(read, part)`, which `loadBitDbS6` (node:fs) now uses, and `fetchBitDbS6(part,
  fetchJson)` for the browser, which fetches the part's files only (`s6DbNames(part)`), each once. Both are exported by
  the package's main module.
  - **Tests:** test/s6-bitdb-browser.test.js.
