In short:

- **A shared project's follower or editor reconnects on its own:** when the Wi-Fi drops, the laptop sleeps or the
  relay restarts, the page no longer stops following. The toolbar says "Reconnecting to <owner>…", and the page joins
  again on its own for up to 5 minutes. Then the project is up to date again. An editor's changes made meanwhile are
  not lost: they reach the owner and everyone else once the page is back.

In detail:

- **Shared projects, phase 4a: a follower's and an editor's connection made again (#3835, part of #3180):**
  - **When:** the connection is lost once the project has arrived, and nothing ended it on purpose: the owner did not
    stop sharing, the follower did not leave, no limit was passed, and the room did not refuse it (close codes 1003,
    1008, 1009). A new try follows after 1, 2, 4, 8 and then every 15 s, for 5 minutes at most, and at once when the
    browser is back online (`core/collab-client.js` `followRoom`'s `reconnect`, `RECONNECT`). A room its owner stopped
    sharing meanwhile ends the session, with the room's reason (`NOT_SHARED`, the room's own words, `core/collab-room.js`).
  - **The same participant:** the page keeps the same document and client id. The owner sends the whole document
    again, as at any join. Who is in comes back on both sides: the others' states are forgotten at the loss, clocks
    included, and this participant's own is sent with a newer clock, so neither side ignores it.
  - **An editor's changes:** its own updates are kept. When the owner's whole document arrives, the editor sends,
    signed, what of them the owner's document lacks (its updates past the owner's clock of this client; its deletions
    with them). This also covers changes sent into a connection that was already lost before its close was noticed.
    Nothing else of the document is sent, so the owner's edit checks (#3527) refuse nothing.
  - **A connection that never opens:** it now fails when its socket closes before it opens, or after 10 s, instead of
    waiting forever.
  - **Security:** the keys and the signatures are unchanged. A rejoin is a join, checked as one by the room. A client id
    another participant holds is still refused, so the old connection must be gone first: the relay's pings end it. An
    editor's resent changes are signed with its link's key and checked as any edit.
  - **The page** (`web/js/collab-follow.js`): "Reconnecting to <owner>…" in the toolbar while lost (Portuguese: "A
    religar a <owner>…"), with no one else shown. The console says "WARNING: The connection to <owner>'s project … was
    lost: reconnecting …" and "Reconnected to <owner>'s project …". A room the owner's page hosts (WebRTC) is not
    reconnected yet: that is phase 4b.
  - **The MCP** (`follow_project`): its follow reconnects the same way. Meanwhile its result says so (`connected:
    false`), and a write is merged then and sent once the connection is back.
  - Tests: test/collab-reconnect.test.js (the rejoin, an editor's changes made offline and lost on the way, a
    deletion, a follower sending nothing, the ends that are not made again, given up, close() while lost),
    mcp-collab (#3835: a follow cut and back, a write meanwhile on the disk, no warning), UI collab-reconnect (an
    editor's page cut and back in both interfaces; a follower's page in Portuguese).
