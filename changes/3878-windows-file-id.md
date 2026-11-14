In short:
- **Windows:** a project's file is no longer taken, now and then, for its `silinx.json` (Convert to Schematic or a
  write refused with "silinx.json is the project's description").

In detail:
- **The project's description told by its 64-bit file id (#3878):** `isProjectFileAt` (server/projects.js) compares
  the files' device and file id as `bigint`: Windows's file ids are past a Number's precision, and two files of a
  folder could round to the same one (the release CI's Windows run, test/drawing-nesting.test.js #3559). Test:
  test/project-store.test.js.
