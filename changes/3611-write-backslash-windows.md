In short:

- **A file's name with a backslash refused on Windows too:** writing or renaming a file to `src/a\b.vhd` is refused,
  as on the other systems, instead of making a folder `a` with `b.vhd` in it.

In detail:

- **A written or renamed file's name checked as it was given (#3611):** the import gate's check of a file the
  interface or the MCP writes (`PUT /file`, `write_file`) and of a rename's new name (`rename_file`, Rename) reads
  the name before the system joins it: on Windows `\` is a folder's separator, so `src/a\b.vhd` became
  `src/a/b.vhd`, which the gate let through.
