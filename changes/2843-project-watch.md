In short:

- **The open project follows the MCP server:** what an assistant does through `silinx-ise mcp` in the same workspace
  (a source written or made, a run) shows up in the interface of `silinx-ise serve` at once: the Design pane, an open
  editor, the processes' marks and the Design Summary. A file changed in the editor and on disk asks which to keep.

In detail:

- **The local server watches the open project (#2843):** `server/project-watch.js` looks at the folder of every
  project a page has open (its files, `build/reports.json`, `build/silinx-status.json`) and tells the page what
  another process changed (`GET /api/projects/:p/events`, server-sent events read through fetch, the token in a
  header); the server's own changes (a request of the page that may write, a run of its own) are not told back.
  The page (`web/js/project-watch.js`) reloads the project, an open document with no changes of its own (a deleted
  one closed), the processes' marks from a run made outside it, and the Design Summary; a document changed in the
  editor too asks "File Changed on Disk" (Keep the Editor's / Load from Disk). The browser edition has no events.
