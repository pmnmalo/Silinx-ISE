In short:

- **Git on Windows:** a project whose folder Windows names by a short (8.3) name, as its temporary folder often is,
  is found in its repository again (Status, Commit, Push, Pull no longer say it is in none).

In detail:

- **Git, a project's repository on Windows (#3611, #3613, #3616):** the project's folder, the repository's top and
  the workspace compared by the system's resolution of their paths (`fs.realpathSync.native`, as git reports them),
  which expands a short (8.3) name such as `RUNNER~1`; `fs.realpathSync` kept it, so no project was in a repository
  and `GIT_CEILING_DIRECTORIES` named the workspace's folder by a form git did not match. A test repository named
  `nul`, a reserved name on Windows, renamed.
