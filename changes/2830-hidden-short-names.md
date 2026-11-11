In detail:

- **Hidden paths: 8.3 aliases refused (part of #2830):** a path segment with a '~' and digits in its base name (a short
  name such as `GIT~1`, which Windows may take for `.git`) is refused as a hidden one, on every system: by the import
  gate (a zip, a new name, a rename), the server's file writes (the interface's) and the MCP's file tools; and a path
  the system's own realpath (its native form, which expands short names) resolves to a hidden one is refused too
  (`server/paths.js` hiddenName, nativeRealOf).
