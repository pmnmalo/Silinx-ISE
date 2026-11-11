In detail:

- **Board programming: a workspace bitstream named in another case keeps its project's trust (Fixes #3358):** on a
  case-insensitive file system (macOS, Windows) a bitstream's path that names the workspace or its project in another
  case is still that project's: `server/impl-routes.js` compares the paths as the system names them (realpath's native
  form) and, by name, with their case folded (`core/fold-name.js`), so an untrusted project's bitstream is refused
  however its path is spelt. Test: programmer (the workspace, the project and the file in other cases: refused while
  untrusted, programmed once trusted; a loose file in no project).
