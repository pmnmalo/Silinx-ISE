In detail:

- **Convert to Schematic: an instance's drawing in a module of its own (#2901, #405):** the step of `schematicFromHdl`
  that draws a module instance as a module symbol moved, as it was, to `core/schdoc-instance.js`
  (`mountInstanceDrawing`), so that the function (296 lines) has room for #2901's fix; the same schematics on the
  repository's 185 modules (examples, test designs, the schematic corpus, the fixtures), its own test.
