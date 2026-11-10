In detail:

- **The browser edition's host: a shared project over 256 KB reaches its followers (#3245):** the owner's page sends a
  new follower the whole project as one frame. Over a WebRTC data channel, whose messages are 256 KB at most in Chrome
  (16 KB everywhere), a larger project never arrived ("Trying to send message larger than max-message-size"). A frame
  larger than a part now goes over the channel as parts, joined again at the other end before the room or the
  participant sees it (`core/collab-frag.js`). The total is capped: 16 MB from the owner, 2 MB from a follower before
  the room's own limit of a follower's frame.
