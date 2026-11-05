In detail:

- **app.js's "where the user was" in a module of its own (#2886, #405):** the open documents' state kept per project
  (#160, #163: `saveViewState`, `restoreViewState`, `closeAllDocs` and their reopening table) moved as it was to
  web/js/view-state.js, app.js re-exporting what moved; no change of behaviour. app.js from 998 lines to 939, room
  for a link to carry the view (#2886).
