In short:

- **Shared projects:** an editor of a shared project's link now edits its Petri nets live with you too: a place moved
  by one while another renames a transition both stay, each one's Undo undoes their own, and your page writes the net
  and its HDL.

In detail:

- **A shared project's Petri nets edited live (#3183, its fourth editor):** a Petri net (`.pn.json`) is a structure of
  its own in the shared project's document (`core/collab-model.js`): its places, transitions and arcs keyed by their
  ids (an arc names a place or a transition: `refs` of two collections), its inputs, outputs and settings; an arc to a
  place or a transition another participant deleted goes with it, said in the console. The net's editor binds to it as
  the others do (`web/js/petri-editor.js` `setShared`, `applyModel`, `busy`: a place or a transition being moved, or a
  field of the side panel being typed, finished first; the tool and an arc being drawn kept); an editor's page edits it
  (no read-only notice); the owner's page writes an editor's change and generates its HDL again (`syncHdlFromPetri`,
  now exported). The MCP's `follow_project` reads a Petri net as merged with its Check and writes one as its edit;
  `share_project` writes an editor's change and its HDL. The messages name the Petri nets (Portuguese too). Tests:
  collab-model (tokens and a guard changed at once, an arc to a deleted transition dropped, two places added at once,
  the generated HDL identical on both sides and simulated the same in VHDL and in Verilog, each one's undo),
  mcp-collab (a page and the MCP client changing a net at once, written with its HDL), UI collab-pn (the owner and an
  editor in both interfaces: a place dragged and a transition renamed at once, on the disk with the HDL, each one's
  Undo, the dialog in Portuguese), collab-fsm, collab-tt, collab-asm, collab-edit (the messages).
