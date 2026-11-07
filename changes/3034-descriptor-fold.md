In detail:

- **An imported project's file named as a case-insensitive file system reads silinx.json is refused (#3034):** the
  import gate (`core/import-gate.js` normalizePath) refuses a path whose last name folds to silinx.json but is not
  silinx.json itself (`SILINX.JSON`, `ſilinx.json`, a fullwidth `ｓ`: "another spelling of silinx.json, the project's
  description"), in a zip, a folder, a design link, a file added and a rename, and finds names that differ only by
  their case by the same fold (the full case fold and NFKC, not toLowerCase alone: `ſel.vhd` beside `sel.vhd`, an NFD
  name beside its NFC one). The fold is the server's, moved into a module of its own (`core/fold-name.js` foldName,
  re-exported by `server/projects.js`); the browser's stores (`web/js/project-store.js`: writing, renaming, deleting,
  listing a folder's files, an import's files) and a link's paths (`core/design-link.js` safePath) compare folded
  names too, so such a file is never one of the project's files and is never saved over its description.
