In short:

- **One way to move a project, the Silinx zip:** the browser edition's File menu no longer has Download / Open
  Project Bundle…; File ▸ Export / Import Silinx Project (.zip)… does the same, in every edition, and Import Silinx
  Project also opens an old project bundle (.silinx.json).

In detail:

- **The project bundle removed (#3548):** File ▸ Download Project Bundle… and Open Project Bundle… of the browser
  edition removed, with the API behind them (api-local.js exportBundle / importBundle) and their labels; the texts that
  pointed to the bundle (the console's notice of the browser edition, a full browser storage's error, the way to the
  full application, the README, Getting Started / Começar) point to File ▸ Export Silinx Project (.zip)…. In the browser
  edition, Import Silinx Project (.zip)… also takes an old `.silinx.json` bundle (project-store.js bundleEntries: its
  silinx.json and its text files as a zip's entries), through the import gate (#2830), with the zip import's naming
  and warnings; its dialog says so. The snapshot that brings back a replaced project when its import fails is the
  Silinx zip in the browser edition too.
