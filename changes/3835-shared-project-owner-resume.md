In short:

- **A shared project's owner reconnects on its own too:** when the owner's Wi-Fi drops or the laptop sleeps, sharing no
  longer ends. The toolbar says "Reconnecting…", and the followers keep the project as it was. Once the owner is back,
  within 2 minutes, they get everything that changed meanwhile, and nobody has to open the link again.

In detail:

- **Shared projects, phase 4c: the owner's room resumed on the relay (#3835, part of #3180):**
  - **The relay keeps the room** for 2 minutes after its owner's connection is lost (`server/collab-relay.js`
    `RELAY_LIMITS.grace`). Its followers stay connected meanwhile, and are not told. Past that, they are told "the
    owner's connection was lost" (`core/collab-room.js` `OWNER_LOST`). Stop Sharing still ends the room at once. A room
    the owner's page hosts (#3227) has no grace: its owner is the page itself.
  - **The owner resumes it** (`core/collab-client.js` `shareRoom`'s `reconnect`): the room's open is answered with a
    secret, and a new connection sends `{ type: 'resume', room, resume, client }`. Its tries follow the followers':
    after 1, 2, 4, 8, then every 15 s. The room then counts each of its followers as a join again, so the owner sends
    each one the whole document: what changed meanwhile arrives. An editor's changes made meanwhile reach the owner
    (the editor's catch-up of phase 4a), and each follower's presence is sent again. A connection of the owner's that
    the relay has not seen lost yet is replaced by the resume.
  - **The end:** a room the relay no longer keeps (the grace past, the server restarted) ends the owner's session,
    said. The room also tells its owner why it closed, so that this is never taken for a loss.
  - **Security:** the keys and the signatures are unchanged, and the relay still reads nothing. The resume secret is
    128 random bits, given only to the owner (never in a link), and compared in constant time. A resume needs the
    server's token, as any open, and the room's client id. A wrong one is refused as a room no longer shared.
  - **The protocol's version** stays 4: the resume is a new first message, and the open's answer has a new field that
    older pages ignore.
  - **The page** (`web/js/collab-share.js`): "Reconnecting…" in the toolbar while lost (Portuguese: "A religar…"). The
    console says "WARNING: Sharing "<project>": the connection to the relay was lost: reconnecting …" and "Sharing
    "<project>": reconnected to the relay …".
  - **The MCP** (`share_project`): its share is resumed the same way. Its status says so meanwhile (`connected:
    false`, a line), and a change on disk meanwhile reaches the followers once it is back.
  - Tests: collab-room (the grace, the resume and its refusals, a connection replaced, the end past the grace),
    collab-resume (the owner's change meanwhile at the follower's, an editor's at the owner's, no grace, close() while
    lost, reconnect: false), collab (over the relay: a room resumed, the grace's end), mcp-collab (share_project cut
    and back), UI collab-reconnect (the owner's page cut and back in both interfaces, and in Portuguese).
