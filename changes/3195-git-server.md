In detail:

- **Git, phase 1: the server's side (#3195, part of #3194):** `server/git.js` runs the system's git for a project of the
  server editions. It can clone a GitHub repository into the workspace as a project, and initialize a repository with
  Silinx's `.gitignore` (`build/` and ISE's outputs left out) and its GitHub remote. It gives the project's status,
  commits its folder's files (never the tools' outputs), pushes and pulls with merges. A pull that conflicts is undone,
  so the files stay as they were. It also gives the history and a file as it was in a commit.
  - **Where git runs:** the repository is the project's folder, or the workspace when the workspace is a clone of
    several projects. It is never one above the workspace, and every command stays inside the project's folder.
  - **How git runs:**
    - spawned with an argument array, never through a shell, with a timeout;
    - with no prompt;
    - no repository's hooks or fsmonitor run;
    - only https and ssh, and remotes on github.com only;
    - no symbolic link is checked out.
  - **Credentials:** they are the system's credential helper's. Silinx never asks for, stores or logs one.
  - **A cloned project:** it is untrusted (#2830), with its trust mark in `.git` so its `silinx.json` stays the
    repository's. Its files pass the import gate.
  - **The routes:** `/api/git/clone` and `/api/projects/:p/git/…`, whose failures answer their message and a hint.
  - **The MCP tools:** `git_clone`, `git_init`, `git_status`, `git_commit`, `git_push`, `git_pull` and `git_log`.
  - **Turning git off:** `SILINX_GIT=off` turns it off on a hosted server.
  The interface comes in the next part.
