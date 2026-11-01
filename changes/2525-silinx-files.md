In detail:

- **The Silinx interface's files named after it (#2525, Refs #2451):** web/js/modern.js, web/css/modern.css,
  test/modern.test.js and test/ui/modern.test.js renamed to silinx.js, silinx.css, silinx.test.js, and every
  reference with them (the imports, web/index.html, the test lists, test/timings.json, CI, the docs). A rename only,
  with no change in behaviour; a preference saved with an old id is still migrated.
