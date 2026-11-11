In short:

- **Open from Repository… and Pull:** a repository's hidden files (`.vscode`, `.envrc`, `.gitattributes`, `.github`) no
  longer land in the project's folder; a pull's files pass the import gate, as an imported project's.

In detail:

- **A clone's hidden files stay in the repository (Fixes #3359):** Open from Repository… (and the MCP's `git_clone`)
  checks the repository out with git's sparse checkout (`/*`, `!.*`, `/.gitignore`): its hidden files but `.git` and the
  `.gitignore` stay in the repository, out of the project's folder, for its pulls too, and a commit leaves them as they
  are (`server/git.js` checkoutSparse).
- **A pull's files go through the import gate (#3359):** File ▸ Git ▸ Pull (and `git_pull`) with the system's git gates
  what the pull brought, as a clone and the browser's back end do: a hidden file (a project's `.gitignore` apart), a
  tool's output or another spelling of `silinx.json` is taken out of the folder and left in the repository
  (skip-worktree: a commit neither deletes nor changes it), each with a warning in the console and the tool's result
  (`<path>: not pulled into the project: <reason>`); another file the gate refuses (a NUL byte, a DTD, a size) undoes
  the pull (`reset --keep`: the changes not committed kept), with the gate's messages. Tests: git (a clone's hidden files
  off the disk and in the commits; a pull's warnings, a refused pull), mcp-git (git_pull's warnings), ui/git (the
  console's WARNING).
