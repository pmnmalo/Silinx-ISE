In short:

- **Git on Windows: a project's repository found where the temporary or user folder has a short name.** Status,
  commit, push and pull said "not in a git repository" when a folder of the workspace's path was named by its 8.3
  short name (RUNNER~1), as git names it by its long one.

In detail:

- **Git: the project's folder compared with git's in its native form (#3613).** server/git.js compared the
  repository's top folder, which git gives by its long name, with the project's folder through fs.realpathSync, which
  leaves a Windows short name as it is: every git command of the interface and the MCP said "not in a git
  repository". It now uses the native realpath, as the workspace's ceiling for git does.
- **The MCP's results name a path in the workspace or the exchange folder with / on every system (#3611):**
  `<exchange folder>/a.zip`, as the tools take it, no longer Windows' `<exchange folder>\a.zip`.
- **A file written or renamed with a backslash in its name is refused on Windows too (#3611):** Windows read the
  backslash as a folder's separator before the import gate saw the name, so `src/a\b.vhd` was written as `src/a/b.vhd`.
- **The tests on Windows (#3611, #3613, #3616):** paths compared with /, modules imported by their file:// URL, Python
  found by its own path, no bare repository named `nul`, no file named with `"` (the history scan's commit made through
  git's index), the short name GIT~1 (.git's own) not taken for a folder made.
