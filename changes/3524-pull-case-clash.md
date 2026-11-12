In short:

- **Git Pull:** a pull that brings a file whose name differs from one of the project's only by its case (`SILINX.JSON`
  next to `silinx.json`) pulls nothing and says so; on macOS and Windows it deleted the project's `silinx.json`.

In detail:

- **Git pull: a name another tracked file has but for its case refused and undone (#3524):** on a case-insensitive file
  system the two names are one file, which the pull wrote over and the import gate's taking out of another spelling of
  `silinx.json` then deleted, so the project vanished from the workspace. Such a pull is refused on any file system, as
  a clone's gate refuses the name ("same name as … but for its case"), and undone: the branch where it was, the other
  file as it was (its changes not committed kept); a file taken out of the folder is never one another tracked path
  names. Test: git (the exact error, `silinx.json` and the source kept, the project opens, a later pull without the
  names).
