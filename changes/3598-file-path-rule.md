In detail:

- **A file's path: one rule in the browser and on the server (#3598).** Read, write, rename and delete (the interface's
  and the MCP's file tools) take a path by `filePath` (core/import-gate.js) in both editions: `src/../x.v` is refused
  (the server read it as `x.v`) and `src\y.v` too (the browser's store took it for `src/y.v`), with the same message,
  `'src\y.v': invalid path: backslash in the name`; `./src//a.v` is still `src/a.v`.
