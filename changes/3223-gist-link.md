In short:

- **Short project links:** Copy Link can make a short link (about 140 characters), the project encrypted in a secret
  gist of your GitHub account, for a chat that refuses a long link; opening it needs no sign-in.

In detail:

- **Copy Link's short link through an encrypted secret gist (#3223):** `core/gist-link.js` encrypts the design where
  the link is made (AES-GCM, a random key) and saves it as a secret gist of the user's account, the key only in the
  link (`#gist=<id>.<key>`, with `view=`, `top=`, `ui=` as before). Opening the link reads the gist through GitHub's
  API with no sign-in, decrypts it and imports it as a design link (`core/design-link.js`: the same gate and limits).
  A wrong key, a deleted gist or a gist that is not Silinx's is refused, its message in the console. Copy Link
  (`web/js/link-copy.js`) chooses between the full link and the short one. The short one is made when it is copied,
  with the browser edition's GitHub sign-in (offered when there is none) or a server's `GH_TOKEN` (`server/git-github.js`,
  `/api/gist`). The sign-in asks for gists too: the device flow's scope, and the token's Gists permission. The MCP's
  `project_link` takes `short`, and `open_link` opens a short link. Tests: gist-link (the round trip, a wrong key, a
  tampered, deleted or other gist, the size limits, the server's gist), github-signin, mcp-gist, UI gist-link in both
  interfaces and in Portuguese.
