In short:

- **Share Project… in the browser edition:** your own page hosts the shared project; no server is needed. Each
  follower opens the link and gets a code. They send it to you, Add a Follower… gives your answer's code back, and they
  paste it to connect. Sharing lasts while your page is open.

In detail:

- **Shared projects in the browser edition: the owner's page as the host (#3227, part of #3180):**
  - **The room in the page:** the room runs in the owner's page (`core/collab-loop.js`, over `core/collab-room.js`).
    The owner's participant reaches it through a pair of sockets in the page.
  - **The followers:** each follower reaches the room over a WebRTC data channel (`web/js/collab-rtc.js`), in a star
    around the owner's page. The participants, the protocol, the sealed frames and their checks are the relay's: a
    follower's edits are refused, and a follower's frame larger than 64 KB closes their channel.
  - **The codes:** the first contact is two codes exchanged by hand (`core/collab-codes.js`), the follower's WebRTC
    offer and the owner's answer. Each is compressed and sealed with the link's key, its kind and the room
    authenticated, so a code reveals no address to whoever carries it. Only someone with the link makes a code the
    other side takes. A code's size is capped, and so is its description once inflated.
  - **The link** says that the owner's page hosts the room: `…#follow=<room>.<key>.host`.
  - **The interface** (`web/js/collab-host.js`): Add a Follower… is in the sharing dialog and in the presence's menu,
    and the follower has a Connect to the Owner dialog. A public STUN server is used, and each browser can set its own
    list.
  - **Where it works:** a Silinx opened from a file cannot share (it has no address that others can open).
    `follow_project` of the MCP server says that such a link is followed in a browser.
