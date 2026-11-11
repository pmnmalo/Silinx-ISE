In short:

- **Shared projects:** an editor of a shared project's link now edits its state diagrams (FSM) live with you, as its
  text files: both changes merge, state by state and field by field, each one's Undo undoes their own, and your page
  writes the diagram and its HDL.

In detail:

- **A shared project's state diagrams edited live (#3183, phase 3 of #3180, the FSM first):** each state diagram of a
  shared project is a Yjs structure of its own in the project's document (`core/collab-model.js`: a map per state and
  per transition, keyed by its id, and one of the diagram's settings; the editors' kinds in `core/collab-kinds.js`), so
  that several participants change one diagram at once: a change is applied as the smallest set of changes from the
  model the editor last had (what the others changed meanwhile kept), two participants changing one field leave the same
  value on both sides, an object one deletes while another changes it stays deleted, a transition to a state another
  deleted goes with it (said in the console, `WARNING: …: a transition (…) removed with what it connected, deleted by
  another participant.`), two states added at once with the same id both kept (each one's ids made its own), the
  objects' order kept. The FSM editor binds to it (`web/js/collab-drawing.js`; `fsm-editor.js` `setShared`,
  `applyModel`, `busy`): its changes pushed as it commits them, the others' applied in place (its view, selection and a
  name being typed kept; a drag or a field being typed finished first), Undo / Redo a `Y.UndoManager` of this
  participant's own changes. The owner's page (`web/js/collab-share.js`) writes what an editor changes to the disk
  through the import gate, the project untrusted (#3355), and generates its HDL again; a structure an editor may not
  change is undone; the drawings the disk changes are applied over the participants' changes. An editor's page
  (`web/js/collab-follow.js`) edits the shared state diagrams (no read-only notice), its other drawings still read only;
  the generated HDL is the owner's, made from the merged diagram. A follower takes at most 100,000 drawing objects
  (`FOLLOW_LIMITS.objects`). The MCP server: `share_project`'s editors change its state diagrams too (written, their HDL
  made again, `server/drawing-sync.js`), `follow_project` reads a state diagram as merged with its Check
  (`server/mcp-check.js` `checkDrawing`) and writes one as this participant's edit, merged with the others'. Tests:
  collab-model (two participants converge, concurrent edits of one state, a deleted state's connection, the same new
  id at once, each one's undo, the owner's files read again, the generated HDL identical on both sides and simulated
  in VHDL and in Verilog), mcp-collab (a page and the MCP client editing one diagram at once, written with its HDL, its
  Check), collab (the follower's limits), UI collab-fsm (the owner and an editor in both interfaces: both changes on
  both sides, written with the HDL, each one's Undo, a transition to a deleted state said, the dialog in Portuguese),
  collab-edit (the editor's message).
