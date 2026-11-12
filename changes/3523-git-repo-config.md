In short:

- Security: git runs in no repository whose own configuration names a program to run (a filter, a driver, a helper),
  and every address of its remote is checked to be GitHub's (#3523).

In detail:

- Git, a repository's own configuration (#3523, `server/git-repo-config.js`): before any git command runs in a
  project's repository, its local configuration is read, and a setting outside the ones a clone, Silinx and the usual
  tools write (a content filter, a merge or diff driver, a signing program, a credential helper, a remote's helper, an
  included file, a rewritten address, an alias…) stops it: "the repository's own configuration sets '<setting>': Silinx
  runs no git command in it", with how to remove it. Silinx turned off a repository's hooks and its fsmonitor already;
  a folder copied into the workspace with its own `.git` could still name other programs, run by the status a project's
  opening asks for.
- Git, the remote's addresses (#3523): every fetch and push URL of `origin` is checked to be github.com's before a
  pull and a push, not only the first of each (git pushes to every push URL).
