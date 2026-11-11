In short:

- The browser edition's GitHub sign-in asks for your public repositories and gists only, your private ones when you tick
  them; Remember me (ticked by default) keeps it in the browser, and unticked keeps it in the tab until it closes.

In detail:

- **The browser edition's GitHub token: a narrower scope, Remember me a choice (#3356):** the device flow
  asks for `public_repo gist` (`core/github-api.js` `SCOPE`), and for `repo gist` (`PRIVATE_SCOPE`) only when the user
  ticks "Include my private repositories" in the sign-in's first step (Get a Code). The token, the device flow's or a
  pasted one, is kept in `localStorage` while "Remember me in this browser" is ticked (the default), in the tab's
  `sessionStorage` when the user unticks it (`web/js/git-browser.js`, `web/js/git-signin.js`), the other place cleared; each edition keeps its own key
  (the development site's `silinx.dev.`); Sign out forgets both. The console says where it is kept. SECURITY.md
  describes the trade-off (the `pmnmalo.github.io` origin that the account's Pages sites share). Tests: github-signin
  (where the token is kept, the edition's key, the scopes asked; fails on the old code), UI git-browser (the sign-in's
  choices, the storage, in Portuguese, both interfaces).
