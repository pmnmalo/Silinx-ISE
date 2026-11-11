In short:

- **Shared projects:** an editor of a shared project's link now edits its ASM charts live with you too: a box moved by
  one while another renames a state both stay, each one's Undo undoes their own, and your page writes the chart and its
  HDL.

In detail:

- **A shared project's ASM charts edited live (#3183, its third editor):** an ASM chart (`.asm.json`) is a structure of
  its own in the shared project's document (`core/collab-model.js`): its boxes (states, decisions, conditional outputs,
  case and every-cycle blocks) and its links, keyed by their ids, its data path (inputs, outputs, registers, generics)
  and settings; a link from or to a box another participant deleted goes with it, said in the console. A connection may
  now name objects of several collections (`refs`), as a Petri net's arcs will. The chart's editor binds to it as the
  state diagram's does (`web/js/asm-editor.js` `setShared`, `applyModel`, `busy`: boxes being moved, a link being drawn
  or a field of the side panel being typed are finished first); an editor's page edits it (no read-only notice); the
  owner's page writes an editor's change and generates its HDL again (`syncHdlFromAsm`). The MCP's `follow_project`
  reads an ASM chart as merged with its Validate and writes one as its edit; `share_project` writes an editor's change
  and its HDL. The messages name the ASM charts (Portuguese too). Tests: collab-model (a box moved and its actions
  changed at once, a link from a deleted box dropped, the generated HDL identical on both sides and simulated the same
  in VHDL and in Verilog, each one's undo), mcp-collab (a page and the MCP client changing the blinky example's chart
  at once, written with its HDL), UI collab-asm (the owner and an editor in both interfaces: a box dragged and a state
  renamed at once, on the disk with the HDL, each one's Undo, the dialog in Portuguese), collab-fsm, collab-tt,
  collab-edit (the messages).
