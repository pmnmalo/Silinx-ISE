In short:

- **Share Project… (live, read only):** File ▸ Share Project… gives a link. Anyone who opens it follows your project
  as you work: its files and drawings as they change, the editor you have open and your cursor. The toolbar shows who
  follows, and Stop Sharing ends it. A follower follows your editor or browses alone. Everything is read only for
  them, with the notice at the right end of each editor's toolbar. This works in Silinx's server editions (local or
  hosted); the browser edition has no relay yet. The MCP server shares and follows too (`share_project`,
  `follow_project`).

In detail:

- **Shared projects, phase 1: following a project live, read only (#3181, part of #3180):** a project is one Yjs
  document (`core/collab-doc.js`: its `silinx.json` and a `Y.Text` per file; never `build/`, a hidden file or a path
  outside it). The owner's page publishes the document and keeps it current: its saves, renames, deletes, the project's
  settings, and the changes on disk (#2843). A relay on Silinx's own server (`server/collab-relay.js`, a WebSocket at
  `/api/collab`, behind the API's checks of the host and the origin) forwards the room's messages. Opening a room
  needs the server's token. Only the owner's updates go through: a follower's are refused (read only), and only their
  presence passes. The messages are end-to-end encrypted (AES-GCM, `core/collab-crypto.js`) with a key in the link's
  fragment (`…/#follow=<room>.<key>`, `core/collab-link.js`), so the relay reads no file. A room ends with its owner's
  connection. The follower's page reads the project through a backend of its own (`web/js/collab-follow-api.js`): every write is
  refused and nothing reaches the server. The follower follows the owner's open editor and cursor, or browses alone.
  The participants' cursors appear in the text editors, and the presence is at the right end of the main toolbar
  (`web/js/collab-presence.js`). Every message goes to the console. The schematic, ASM and FSM editors open in their
  read-only modes; the truth table's and the Petri net's read-only modes come next, and meanwhile nothing of theirs
  is saved. The MCP tools `share_project` (start, status, stop) and `follow_project` (the files, who is in, the
  owner's view, a file's text) use the same modules. Yjs, y-protocols, lib0 and ws (MIT) are now dependencies (NOTICE,
  THIRD-PARTY-NOTICES.md).
