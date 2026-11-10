In short:

- **Git and GitHub (the server editions):**
  - File ▸ Open from Repository… opens a project from a GitHub repository, a GitHub Classroom assignment's too.
  - Commit…, Push to GitHub and Pull from GitHub send it back and bring others' changes in. Their messages and errors
    go to the console, with a hint.
  - The Design pane marks what changed (M) or is new (N) since the last commit.
  - git signs in with its own credentials: Silinx never asks for a password or a token.

In detail:

- **Git in the interface (#3195, part of #3194):** `web/js/git.js`.
  - **File menu:** Open from Repository… (also on the Start page), then Commit…, Push to GitHub, Pull from GitHub and
    Initialize Repository…. The same commands are in the Design pane's project menu, under Git, since the Silinx
    interface has no File menu.
  - **The dialogs:** a URL that is not GitHub's, or an empty message, is said beside its field.
  - **The console:** a failure is an ERROR line with git's own words, then its hint (a rejected push, a conflict, no
    credentials, no remote).
  - **The marks:** the Design pane's rows are marked M, N or C (in conflict), and the status is read again after every
    write of the project's files.
  - **A pull** is told to the page as a change made outside it, so its open documents are read again.
  - **Shared modules:** `core/github-url.js` (the address checked) and `core/git-messages.js` (the texts) are shared
    with the server and the MCP tools.
  - **Translations:** Portuguese labels in `web/js/i18n-git.js`.
