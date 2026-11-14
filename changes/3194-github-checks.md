In short:

- **GitHub Checks:** Git ▸ GitHub Checks says in the console what GitHub's workflows said of the last push: each
  check's state and, for a GitHub Classroom assignment, each visible test's verdict with its first difference. After a
  push, the console says where to see them.

In detail:

- **A push's checks in Silinx (part of #3194):** File ▸ Git ▸ GitHub Checks, in the Design pane's project menu too
  (`web/js/git.js`), reads the check runs of the project's last pushed commit and their annotations
  (`core/github-checks.js`): the branch's upstream with the system's git (`server/git.js gitChecks`, GitHub's API with the
  server's `GH_TOKEN`, or none for a public repository), the last commit or pull's with GitHub's API (`core/git-rest.js`
  `checks`: the browser edition's sign-in, `SILINX_GIT=github`). The route `GET /api/projects/:p/git/checks`; the MCP's
  `git_checks`, its text marked untrusted (the repository's workflows wrote it). The Classroom template's README and
  docs/CLASSROOM.md say it. Tests: mcp-git (the system's git), mcp-git-github (GitHub's API, the token in the header
  only), mcp, mcp-modules; UI git-browser and git in both interfaces and in Portuguese.
