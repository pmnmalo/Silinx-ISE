In short:

- **Git in the browser edition:** Open from Repository…, Sign in with GitHub…, Commit and Push…, Pull from GitHub and
  History…, through GitHub's API, with the same marks and messages as the server editions.

In detail:

- **Git in the browser edition, through GitHub's REST API (#3196, part of #3194):** `core/github-api.js` (the client,
  OAuth's device flow, git's blob hash) and `core/git-rest.js` (the back end: clone, init, status, commit, push, pull,
  log, show, with the results and messages of `server/git.js`). A project keeps what it was at its last commit or pull
  beside it; a commit of several files goes through the Git Data API (a tree, a commit, the branch moved, never forced)
  and is pushed at once, so the browser's File menu has Commit and Push… and no Push. A pull merges by file: a file
  changed on GitHub only is taken, one changed here only stays a change, one changed on both sides is a conflict that
  pulls nothing. The repository's hidden and binary files stay on GitHub as they are. `web/js/git-browser.js` plugs it
  into the browser's project storage; `web/js/git-signin.js`, Sign in with GitHub… and Sign out of GitHub; the OAuth
  App's client ID is a setting, `web/js/github-app.js`, a placeholder until the maintainer registers the App (the
  sign-in then says that no OAuth App is set up). The token is kept in the browser only. Tests: git-rest against a
  stand-in for GitHub (`test/fake-github.mjs`: the device flow, a clone, a commit of several files, a rejected commit,
  a pull and its conflict, the history, the token never in a URL nor a message); UI git-browser on the built site in
  both interfaces and in Portuguese.
