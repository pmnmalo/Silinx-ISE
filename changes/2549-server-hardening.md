In short:

- **The local server is stricter with what a project brings along:** symbolic links in its build folder are not followed, and a
  zip restores no hidden file or folder.

In detail:

- **The local server's hardening (#2549):** the build folder never written through a link; include files that are links not
  copied; the settings path kept as its real file; hidden files refused from a zip and from MCP; Silinx's own files guarded
  whatever the case; the pages' policy on the file served, however the URL is spelled; XST's script refuses paths that would
  end its quotes; the command line confines the paths of `silinx.json`; bodies parsed only under `/api`; errors without a
  stack trace; the token compared by digests.
