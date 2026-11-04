In short:

- **Check in the Petri net and state diagram editors:** a Check button in their toolbars, as the ASM chart's
  Validate, writes the model's errors and warnings to the console. The Petri net's Check also runs its token game:
  it finds transitions that never fire and deadlocks.
- **Every check brings its Errors tab to the front, else its Warnings tab:** Check Syntax, Check Constraints, a
  chart's Validate or Check, the Schematic's Check, also when run again with the same messages; errors win over
  warnings.

In detail:

- **The Petri net's and the state diagram's Check (#2803):** a `Check` button with the shared check icon, after the
  editor's zoom or settings (`web/js/petri-editor.js`, `web/js/fsm-editor.js`), hidden in a read-only diagram. Its
  lines go to the Console under Design ("Check Petri Net", "Check State Diagram"), and a click on a line selects
  its item. Its errors and warnings go to the Errors and Warnings tabs (`web/js/editor-problems.js`). The Petri
  net's validation (`core/petri.js`) also finds a transition that is not connected and an arc that takes or puts
  more tokens than its place holds. Its Check (`core/petri-analysis.js checkPetri`) adds the token game's
  transitions that never fire and its first deadlock, with the firing sequence that reaches it, and keeps them in
  the tabs until the net changes. The MCP server's `check_drawing` (`server/mcp-check.js`) checks an ASM chart, a
  state diagram or a Petri net the same way.
- **The end of a check brings its tab to the front (#2803):** `showProblems` of `web/js/console.js` brings the
  Errors tab forward if the check found errors, else the Warnings tab if it found warnings, even when they were
  already listed. Check Syntax (the design, a file, a C source), Check Constraints, the charts' Validate and Check
  and the Schematic's Check in the Silinx interface all end with it. The ASM's Validate no longer brings the
  Console tab in front of its errors. A message written to the console again (a process run again) counts as new,
  so it brings its tab forward too.
