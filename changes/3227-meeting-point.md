In short:

- **Share Project… in the browser edition, with no codes:** a follower opens your link and is in. Your page and theirs
  find each other at a public meeting point. If the meeting point cannot be reached, the codes are exchanged by hand
  as before.

In detail:

- **The meeting point of a shared project the owner's page hosts (Fixes #3227, part of #3180):**
  - **The meeting point** (`core/collab-meet.js`, `web/js/collab-meet.js`): Trystero's torrent strategy, over public
    WebTorrent trackers. Its topic is a hash of the room's id, and its password is the link's key, which encrypts the
    signalling too. The pages' Content-Security-Policy lets in these trackers only.
  - **The owner's key:** a meeting point connects every page that has the link, so the link's key alone cannot tell
    the owner. The owner's page makes a key pair of its own (ECDSA P-256, not the editors'), and the link carries its
    public half: `…#follow=<room>.<key>.host.<owner's key>`, an editor's link too.
  - **The owner's proof:** to each peer that joins, the owner's page first sends its signature of the room, that
    peer's id and the fingerprints of their WebRTC connection. A follower talks to the one peer whose proof checks
    with the link's key, over the connection it was signed for. It sends any other peer nothing and takes nothing from
    it, so a follower cannot pose as the owner, nor relay the owner's proof from a connection of its own.
  - **The followers** found there join the page's room as the codes' do, with a follower's frame limit.
  - **The fall-back:** a follower who finds no owner in 15 s, or who chooses Exchange Codes Instead, exchanges codes
    with the owner (Connect to the Owner, Add a Follower…). A link without the owner's key uses the codes only.
  - **The MCP server:** `follow_project` says that such a link is followed in a browser, as for every hosted room.
  - **Tests:** a meeting point between the pages of one browser (a `BroadcastChannel`) stands for the public one, in
    node and in the UI tests: the owner's proof checked, an impostor's refused, the frames, the fall-back after 15 s.
    Trystero's adapter is checked to load and to wire its calls, with no public tracker reached.
  - **Notices:** Trystero (MIT) in NOTICE and THIRD-PARTY-NOTICES.
