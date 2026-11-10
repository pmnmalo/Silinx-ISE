In short:

- **Compare a drawing's versions:** Compare, in History… and Commit…, shows a schematic, a state diagram or an ASM chart
  side by side with what changed marked, and an HDL file's lines side by side.
- **A drawing's conflicts, object by object:** Pull merges a drawing both sides changed by its objects, and asks Mine or
  Theirs for each object both changed.

In detail:

- **The drawings' diffs and conflicts in git (#3197, part of #3194):** git never merges a drawing's JSON as text (the
  repository's `info/attributes` gives the drawings git's binary merge, `server/git-merge.js`). Silinx merges it by its
  objects: at once when no object is in conflict, else by the choices (`resolve`). The result is checked as Check Drawing
  checks it, and its HDL file is made again and committed with the merge. GitHub's API back end (`core/git-rest.js`)
  does the same. A pull that needs choices says the conflicts (`drawings`), and the interface asks them in Resolve
  Conflicts (`web/js/git-resolve-dialog.js`), then pulls again. Compare (`web/js/drawing-diff-view.js`) shows a file
  of a commit against the commit before (History…) or the project's file against the last commit (Commit…): a drawing
  in its editor's read-only mode, side by side, its objects marked in the theme's colours, the counts in the newer
  one's notice; an HDL file by its lines. The MCP's `git_diff` says a drawing's changes by its objects and an HDL
  file's as a unified diff; `git_pull` takes `resolve`. Tests: git-merge, mcp-git-merge, git-rest (the browser's back
  end), UI git-compare in both interfaces and in Portuguese.
