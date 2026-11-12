In short:

- **A path typed in another case is the project's own.** Writing `SRC/extra.vhd` in a project that has a `src` folder
  writes and lists `src/extra.vhd`, on every system, so the project, its export and a clone on Linux name the same file.

In detail:

- **Project paths spelled as the project spells them (#3536).** On a case-insensitive file system (macOS, Windows)
  `SRC/extra.vhd` went into the project's `src/` folder while the project's description recorded `SRC/extra.vhd`: the
  exported zip then held `src/extra.vhd` beside a `silinx.json` naming `SRC/extra.vhd`, missing on a case-sensitive
  system. Writing, reading, renaming and deleting a file now take each folder (and the file) of its path with the
  spelling the project already has (core/fold-name.js `spelledAs`), on the local server, the MCP's tools and the browser's
  stores alike; a rename to a name the folder has in another case is refused ("already exists"), but a rename of a file's
  or folder's own case, which the browser's workspace folder now makes through a temporary name.
