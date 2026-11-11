In short:

- **Shared projects:** an editor of a shared project's link now edits its schematics live with you too, so every
  drawing of a shared project is edited together: a symbol moved by one while another renames a symbol both stay, each
  one's Undo undoes their own, and your page writes the schematic and its HDL.

In detail:

- **A shared project's schematics edited live (#3183, its last editor: every drawing now):** a schematic (`.sch.json`)
  is a structure of its own in the shared project's document (`core/collab-model.js`): its symbols, wires, net names,
  I/O markers and graphics keyed by their ids, its name, language, sheet and the rest its settings, its keys read back
  in one order on every side. Its connections are where its wires end, not ids: a wire left at a pin another
  participant deleted is said by its check, as any problem. The schematic's editor binds to it as the others do
  (`web/js/sch-edits.js` `setShared`, `applyModel`, `busy`: a symbol being moved, a wire being drawn, a property being
  typed, or a live simulation, finished first; `mountSchEditor` still within its 300 lines); an editor's page edits it
  (no read-only notice); the owner's page writes an editor's change, indented as the schematic editor saves it
  (`drawingText`; a text that holds the same drawing, whatever its keys' order, not written again: `sameDrawing`), and
  generates its HDL again (`syncHdlFromSchematic`). The MCP's `follow_project` reads and writes a schematic as merged;
  `share_project` writes an editor's change and its HDL. The messages now say "its text files and drawings" (Portuguese
  too). Tests: collab-model (the corpus's schematics through the structure and back; a symbol moved and renamed at once,
  a wire and a symbol added at once, a deleted symbol staying deleted; the generated HDL identical on both sides,
  compiled and elaborated in VHDL and in Verilog, the same logic; each one's undo), mcp-collab (a page and the MCP client
  changing the gates example's schematic at once, written with its HDL), UI collab-sch (the owner and an editor in both
  interfaces: a symbol dragged and another renamed at once, on the disk with the HDL, each one's Undo, the dialog in
  Portuguese), collab-fsm, collab-tt, collab-asm, collab-pn, collab-edit (the messages).
