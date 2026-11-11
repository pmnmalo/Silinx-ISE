In short:

- **State diagram editor:** the Outputs (Moore) and Outputs (Mealy) fields, and a state's or a transition's text edited
  on the drawing, say an output the machine does not have and a value that is not a constant (`z0=1z=1`, a comma
  missing) under the field, and keep the outputs as they were, as Check says it.

In detail:

- **A state diagram's output assignments checked as they are typed (#3288):** `core/fsm.js parseOutputs(text,
  outputs)` (and `parseLabel`), given the machine's outputs, checks each assignment as Check does
  (`outputProblems`, which `validateFsm` now uses too): an output that is not declared, a value that is not a
  constant. The side panel's Outputs fields (`web/js/fsm-side.js`) and the drawing's inline edit
  (`web/js/fsm-inline.js`) pass it; the fields' errors have their Portuguese translation (`web/js/i18n-fsm.js`). The
  MCP's `write_file` and `check_drawing` give the same messages, the state's or transition's name before them. Tests:
  fsm (the field's cases, a transition's label, Check's messages), fsm-i18n, mcp-check (`write_file` and
  `check_drawing` of a diagram with both errors), UI fsm-side (the fields' errors, in English and Portuguese).
