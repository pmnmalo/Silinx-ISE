In detail:

- **A shared project's room, a module of its own (#3227, part of #3180):** what the server's relay does with a room
  moved, as it was, from `server/collab-relay.js` to `core/collab-room.js`: who owns the room, its followers, what
  passes between them (a follower's updates refused), who joins and leaves, its limits, its end with the owner. The
  owner's page can then host its room itself, in the browser edition, which has no server. The relay keeps its
  WebSockets: the endpoints, the token at the upgrade, the frames' maximum by role, the pings. Its behaviour is
  unchanged, and the module has its own test (`test/collab-room.test.js`).
