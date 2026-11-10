In short:

- **Sharing from the browser edition through a relay:** when the site is built with relays of its own, Share Project…
  can share through one of them instead of your own page: a Silinx server that lets the site in (a university's, for
  example). You give the key from its administrator, and it is remembered in this browser. The followers then just
  open the link, with no codes to exchange, and the sharing does not depend on your page staying reachable. The follow
  dialog names the relay.

In detail:

- **A relay on another Silinx (#3227, part of #3180):**
  - **On the relay:** its administrator opts in through `config.json` (`relay.origins` and `relay.key`, never through
    the API: `FILE_ONLY`). The listed sites' pages are let in on the relay's two endpoints only; the API keeps its
    checks. The key opens a room as the server's token does, checked at the upgrade (`server/toolchain.js`
    `relayConfig`, `server/server.js`).
  - **The relays a page may use** are an explicit list: for a server's pages, `config.json`'s `relay.relays`, which
    `GET /api/collab/relays` gives them; for the browser edition, the list fixed when the site is built
    (`SILINX_SITE_RELAYS`, none by default). A page's Content-Security-Policy lets it connect to those relays only:
    each one's origin and its WebSockets' (`relaySources`), never a scheme alone.
  - **The link** names the relay: `…#follow=<room>.<key>&relay=<its address>` (an http(s) origin, no user nor
    password, `core/collab-link.js` `relayAddress`). A follower's page connects to that relay's follow endpoint, and
    the follow dialog names its host. A link through a relay that is not one of this Silinx's is refused, the console
    saying why.
  - **The browser edition's Share Project…** offers "Through a relay" among the site's relays, with the relay's key
    (`web/js/collab-share.js`).
  - **The MCP server:** `follow_project` follows a link through the relay it names. `share_project` takes a relay's
    `key`.
