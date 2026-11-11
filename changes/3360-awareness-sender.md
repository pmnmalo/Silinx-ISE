In detail:

- **A follower's presence speaks for that follower only (#3360):** in a shared project's room, the relay (or the
  owner's page that hosts it) marks a follower's awareness with the client id the follower joined with
  (`KIND.from`, `core/collab-client.js` `fromFrame`), and every participant applies from it only that follower's own
  state (`applyAwarenessFrom`): a follower holding the room's key can no longer pose as the owner (open a file in the
  other followers' pages, move their cursor, show another name), replace another's state, or fill the presence with
  ghosts. No participant takes a remote update of its own state, and the room refuses a join with the owner's or
  another follower's client id ("another participant of this shared project has this client id"); the protocol's
  version is 3. Tests: collab-room (the mark, the refused join), collab (a forged owner, another follower and a
  ghost dropped in every page; a raw join with the owner's id refused).
