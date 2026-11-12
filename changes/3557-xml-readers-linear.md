In detail:

- **The .sch / .sym, .wcfg and PNML readers in linear time (#3557):** regular expressions that went back over the
  text, quadratic in a file the import gate accepts, are scans that read each character a bounded number of times,
  with the same results: an ISE schematic's or symbol's start-tag attributes on a long name with no '='
  (core/isesch.js, the scan in core/xml-attrs.js; 80 kB took 12.6 s), a VERSION 5 symbol's SYMPIN lines over many
  blank lines (100,000: 29 s), a wave configuration's comments, instructions and CDATA left unclosed (core/wcfg.js,
  one scanner for the whole file; 160 kB took 4 s), and a PNML file's `<net>`, `<place>`, `<transition>` and `<arc>`
  with no end (core/petri.js `fromPnml`, the searches in core/pnml-scan.js; 200 kB took 5 s). A character reference
  past Unicode (`&#x110000;` on) threw `RangeError: Invalid code point`: in a schematic or symbol it reads as U+FFFD
  (that reader takes any text), in a wave configuration it is the file's error ("malformed XML: invalid character
  reference '…'"). The repository's schematics read the same; random documents read the same as with the
  expressions. Tests: test/xml-readers-linear.test.js (each case at n and 2n in a child process with a time limit:
  about twice the time, the same result; the errors exact; the scans against the expressions they replace).
