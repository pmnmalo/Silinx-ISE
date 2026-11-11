In detail:

- **An imported project never gets a build/ (#3405):** a Silinx zip (or project folder) whose files are under a root
  folder has each path checked by the import gate's rules again once that folder is taken off, so its `build/` (Silinx's
  own: the bitstream, the reports) is refused as it is in a zip without the root folder (`p/build/top.bit: not
  imported: the project's build folder (build/) is Silinx's own`), through the interface's import and the MCP's
  `import_project` alike.
