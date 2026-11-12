In short:
- Copy Link's short link can expire (in a week, a month, six months or a year; never by default): opened after its date it is refused, and making a short link deletes your expired ones from your gists.

In detail:
- A short link's expiry (#3629, `core/gist-link.js`): kept in the gist beside the encrypted design and authenticated with it (AES-GCM's additional data, the gist's version 2; #3223's links, version 1, open as before, with no expiry), and in the gist's description in the clear; opening an expired link is refused, saying when it expired; making a short link deletes the user's Silinx gists that have expired (every page of their gists read first; a gist not only Silinx's never touched; a failure of the cleaning never fails the new link). Copy Link's *Expires:* list (Portuguese labels); the MCP's `project_link short` takes `expires_days`, its answer the date and the gists deleted, and `open_link` refuses an expired link in the same words. README, SECURITY.md.
