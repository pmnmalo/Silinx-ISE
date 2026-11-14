In short:

- **A follower of a project its owner's page shares reconnects too:** when the owner was found at the meeting point
  (opening the link was enough), a dropped connection is made again on its own, as with a relay: "Reconnecting to
  <owner>…" in the toolbar, then the project up to date again.

In detail:

- **Shared projects, phase 4b: a hosted room's follower found again at the meeting point (#3835, part of #3180):**
  - **When:** a follower or editor of a room the owner's page hosts (#3227, WebRTC) whose owner was found at the meeting
    point loses its connection. Each new try looks for the owner there again, with no dialog, for up to 15 s
    (`web/js/collab-meet.js` `findOwner`'s class's `rejoin`, `followRoom`'s `transport`). Its tries follow the
    relay's: after 1, 2, 4, 8 and then every 15 s, for 5 minutes at most.
  - **A transport that fails** (the owner not found yet) is tried again later instead of ending the session
    (`core/collab-client.js`); one that gives no socket still ends it.
  - **The codes exchanged by hand** are not made again: they would have to be exchanged again. That session ends at the
    loss, as before.
  - **Security:** unchanged. Each rejoin checks the owner's proof (its signature of this follower's id and of their
    connection, with the link's owner's key), as at the first join. Every other peer at the meeting point is still
    ignored.
  - **The MCP:** `follow_project` does not follow a hosted room (it has no WebRTC), so it has nothing to make again.
  - Tests: collab-reconnect (a transport that fails, then joins; one that keeps failing, given up), collab-meet (a
    follower's connection lost, found again at the meeting point: the owner's change made meanwhile, each sees the
    other again), UI collab-meet (a follower's page cut and back: "Reconnecting to Ana…", the console's lines; both
    interfaces).
