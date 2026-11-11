In short:

- **Shared projects:** an editor of a shared project's link now edits its truth tables (Boolean algebra) live with you
  too: two people changing two cells of one output both keep their change, each one's Undo undoes their own, and your
  page writes the table and its HDL.

In detail:

- **A shared project's truth tables edited live (#3183, its second editor):** a truth table (`.bool.json`, `.tt.json`)
  is a structure of its own in the shared project's document (`core/collab-model.js`): its outputs a collection keyed
  by their names (an output added by two at once is one), each with a field per cell of its column, its typed
  expression, its form and minimal solutions; its inputs, name, language and notes its settings; its keys read back in
  one order on every side, so that every page writes the same file. Each drawing kind now gives its shape and its model
  (`DRAWING_KINDS`: `shape`, `model`, `ownIds`: a truth table's ids are its outputs' names, never renamed). The truth
  table's editor binds to it as the state diagram's does (`web/js/truthtable.js` `setShared`, `applyModel`, `busy`:
  notes or a name being typed are finished first; `web/js/collab-drawing.js` `editorOf`); an editor's page edits it (no
  read-only notice); the owner's page writes an editor's change and generates its HDL again (`syncHdlFromTt`). The
  MCP's `follow_project` reads and writes a truth table as merged, `share_project` writes an editor's change and its HDL.
  The messages say "text files, state diagrams and truth tables" (Portuguese too). Tests: collab-model (the table and
  back; two cells of one column, one cell, one output added by two, the notes; an input added while a cell changes;
  each one's undo; the generated HDL identical on both sides, compiled, elaborated and simulated in VHDL and in
  Verilog), mcp-collab (a page and the MCP client changing two cells at once, written with its HDL), UI collab-tt (the
  owner and an editor in both interfaces: two cells at once on both sides, on the disk with the HDL, each one's Undo,
  the notes, the dialog in Portuguese), collab-fsm, collab-edit (the messages).
