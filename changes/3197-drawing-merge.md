In detail:

- **The drawings' diffs and merges, object by object (#3197, part of #3194):** `core/drawing-merge.js`
  compares two versions of a schematic, an ASM chart, a state diagram, a truth table, a Boolean function or a Petri
  net by their objects (each by its id, or its name), never as text. It says what was added, removed, moved (only its
  place changed) or changed. Its three-way merge takes what only one side changed, and leaves an object both sides
  changed differently to a choice of "mine" or "theirs", never mixed. A Boolean function's table merges one output's
  column at a time. `core/git-resolve.js` lists a pull's conflicts in a drawing, with what each side did, and resolves
  them by the choices. The result is checked as Check Drawing checks it, and refused when an object points at one the
  resolution left out. `core/text-diff.js` gives an HDL file's diff by lines (Myers's), side by side or unified as
  git's. Tests: drawing-merge (every drawing of the examples and the test designs, the unified diff against
  `git diff --no-index`), git-resolve (conflicts resolved both ways, the HDL compiled and simulated in VHDL and
  Verilog, a state diagram against its model).
