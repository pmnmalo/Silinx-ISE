In short:

- The browser edition's GitHub sign-in asks for your public repositories and gists only, your private ones when you tick
  them, and is kept in the tab until it closes unless you tick Remember me.

In detail:

- **The browser edition's GitHub token: a narrower scope, kept in the tab unless remembered (#3356):** the device flow
  asks for `public_repo gist` (`core/github-api.js` `SCOPE`), and for `repo gist` (`PRIVATE_SCOPE`) only when the user
  ticks "Include my private repositories" in the sign-in's first step (Get a Code). The token, the device flow's or a
  pasted one, is kept in the tab's `sessionStorage`, and in `localStorage` only when the user ticks "Remember me in this
  browser" (`web/js/git-browser.js`, `web/js/git-signin.js`), the other place cleared; each edition keeps its own key
  (the development site's `silinx.dev.`); Sign out forgets both. The console says where it is kept. SECURITY.md
  describes the trade-off (the `pmnmalo.github.io` origin that the account's Pages sites share). Tests: github-signin
  (where the token is kept, the edition's key, the scopes asked; fails on the old code), UI git-browser (the sign-in's
  choices, the storage, in Portuguese, both interfaces).
