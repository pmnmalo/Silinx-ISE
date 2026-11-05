In detail:

- **The import gate (#2830):** `core/import-gate.js`, the one module every file or project from outside Silinx is to pass
  through before any parser or editor sees it, the same in the browser and on the server: the sizes of a zip, its
  decompressed total, its file count, each file, a source's lines and nesting (an HDL's long `elsif` chain, #2577),
  checked while the zip is read (a refused entry is never inflated); the names (no `..`, absolute path, drive letter,
  backslash, control character, hidden folder, reserved name, symbolic link, duplicate but for case); XML with no DTD
  or entity declaration (XXE, billion laughs); each file's type by its name and its content (a web page, a script or a
  program refused; a text that is binary or HTML refused; invalid UTF-8 replaced with a warning). `core/zip.js`'s
  `readZip` takes the entry count's cap and a check of each entry before it is inflated, and says which entries are
  symbolic links. SECURITY.md describes the threat model and the three layers (the gate, safe output, trust for
  outside projects); the importers move onto the gate in the next pull requests.
  - **Tests:** test/import-gate.test.js (a test per threat: zip bombs, traversal, symbolic links, XXE and billion
    laughs in every XML format, a script in every file name, oversize and deeply nested sources, types by content;
    the examples and the ISE fixtures accepted with no refusal and no warning), test/zip.test.js.
