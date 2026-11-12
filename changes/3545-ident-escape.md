In detail:

- **The identifier rules and the XML escapes, one copy of each (#3545):** `core/ident.js` (a name: a letter, then
  letters, digits and _; an identifier that may begin with _; a new file's name) and `core/escape.js` (the XML escapes
  of the files Silinx writes, their three sets kept as each writer had them) replace the copies of 15 modules, with
  no change of behaviour (`test/ident-escape.test.js` compares each helper with the copies it replaced, and fails on a
  new copy). The copies in the ASM, FSM and truth-table parsers, Silinx HLS's pragmas and three MCP tools are left for
  a follow-up.
