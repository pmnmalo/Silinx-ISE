In detail:

- **The worktree's `.cache` links out of the repository (#1792):** a link `.cache -> ../../../.cache` (and two
  sync copies, `.cache 2` and `.cache 3`) had been committed with the C++ templates; on the runners it dangles, and the
  Nightly's cache restore and test fetches failed on it before any design ran. The links are removed, `.gitignore`
  ignores `.cache` itself (`.cache/` did not match a link) and its copies, and test/repo-files.test.js fails on any
  tracked symbolic link and on a copy named without an extension ("name 2").
