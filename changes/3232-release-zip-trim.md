In detail:

- **The release zip within its budget again (#3232):** the zip leaves out the files of its packages that the app never
  reads (`scripts/zip-trim.mjs`): every package's source maps and type declarations, the tests, demos and coverage
  that the shared projects' packages ship (lib0, y-protocols, y-codemirror.next), and CodeMirror's legacy modes other
  than the editor's three (VHDL, Verilog, C). The zip goes from 40.4 MB to 38.8 MB, y-codemirror.next (#3182) included. Every package's entry points, the import map's targets, the licences and the `package.json` files stay
  (`test/zip-trim.test.js` checks them on this checkout's packages).
