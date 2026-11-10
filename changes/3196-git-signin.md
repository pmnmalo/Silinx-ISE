In short:

- **Sign in with GitHub in the browser edition:** through Silinx's sign-in relay when the site has one, with a code
  entered at github.com/login/device; otherwise with a fine-grained personal access token you paste, kept in the
  browser only.

In detail:

- **The browser edition's GitHub sign-in, its two ways (#3196, part of #3194):** `web/js/github-app.js` holds the
  OAuth App's client ID and the relay's URL, both placeholders until the maintainer sets them. With both set, Sign in
  with GitHub… runs the device flow through the relay, and the site's Content-Security-Policy allows the relay's
  origin. Otherwise it asks for a fine-grained personal access token, says how to make one and the permissions it
  needs (the repositories to open, Contents read and write), checks it with GitHub's API, and keeps it in the browser
  only (`web/js/git-signin.js`, `web/js/git-browser.js`). `relay/github-device-flow` is the relay, a Cloudflare Worker
  with its README for the maintainer: it forwards only the device flow's two POSTs, with only their own fields,
  answers only Silinx's origins, and keeps and logs nothing. Tests: github-relay (the worker, and a sign-in through
  it), github-signin (the settings, a pasted token), UI git-browser (the token's sign-in in both interfaces and in
  Portuguese).
