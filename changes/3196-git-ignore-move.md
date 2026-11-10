In detail:

- **What git never commits, in a module of its own (#3196, part of #3194):** `core/git-ignore.js`. The tools' outputs
  that a commit leaves out and the `.gitignore` Silinx writes moved there from `server/git.js`, which still exports
  `GITIGNORE`, so the browser edition's GitHub back end shares them. Nothing changes in what git does.
