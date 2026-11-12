In detail:

- **Live sharing: a follower's join sends the whole project to that follower only (#3529):** on a join the owner
  sent the whole document and who is in to the room, and the relay passed it to every follower. Whoever had a follower's
  link could join and leave over and over to multiply the owner's upload and every follower's download. The owner now
  addresses those frames to the follower that joined (`KIND.to`, protocol 4: the frame marked with its client id), and
  the room (`core/collab-room.js`, the server's relay and a page's hosted room alike) gives the sealed frame to that
  follower only. It sends nothing to a follower that has left. Tests: collab-room (the frame to one follower, its mark
  taken off; to one gone, to nobody), collab (a follower already in gets no snapshot while five others join and leave,
  each of them with the project; an owner's change still reaches everyone).
