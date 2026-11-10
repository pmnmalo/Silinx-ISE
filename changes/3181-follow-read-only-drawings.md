In short:

- **Following a shared project:** its truth tables and Petri nets now open in a read-only mode too. You read the table,
  its Karnaugh map and its results, play the net's token game and analyse it, but nothing can be changed.

In detail:

- **Shared projects, phase 1b: the truth table's and the Petri net's read-only modes (#3181, part of #3180):**
  - **Truth table** (`web/js/tt-readonly.js`): the names, the notes and the expression are read only. Fill Table, the ⋮
    menu, the cells' hint, the tick boxes, the solutions' arrows and the map's order are not offered.
  - **Petri net** (`web/js/petri-readonly.js`): the drawing tools, Delete and Import PNML are hidden, the side panel's
    fields are disabled, nodes do not move, and the keys that edit do nothing.
  - **Both editors:** a change that still comes is undone at once. A follower sees the notice at the right end of the
    toolbar, as in the other editors (`test/ui/readonly-notice.test.js`).
  - **The relay's frame limit by role:** the owner and the followers now have endpoints of their own,
    `/api/collab/share` and `/api/collab/follow`, each with its own maximum frame. A follower's frame larger than
    theirs (64 KB) now closes their connection as soon as its length is read, instead of being received whole (up to
    16 MB) and then refused. The server's token now goes in the WebSocket's subprotocols and is checked before the
    connection is accepted, so only the owner gets a connection that takes 16 MB frames.
