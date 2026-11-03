In short:

- **A status line in the drawing editors:** the ASM chart, FSM, Petri net and truth table editors have a status line at
  their bottom, as the Schematic editor's, with their counts, their encoding, Moore or Mealy, a Petri net's tokens; their
  toolbars keep only their tools.

In detail:

- **The status line, one for every editor (#2763):** the Schematic editor's status line becomes a shared module
  (`web/js/status-line.js`, `.doc-status`), mounted by the ASM chart editor (its states and every-cycle blocks, its
  encoding), the FSM editor (its states and transitions, Moore or Mealy, its encoding), the Petri net editor (its places,
  transitions and arcs, its tokens) and the truth table (its inputs, outputs and rows), in their read-only views too;
  the counts leave their toolbars (#2725, #2734, #2748). Left out of a print. docs/UI-GUIDELINES.md says what the status
  line holds and what stays in the toolbar.
