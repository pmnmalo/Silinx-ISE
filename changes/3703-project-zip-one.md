In short:

- **Import Project (.zip)… and Export Project (.zip)…:** the four Silinx and Xilinx ISE zip entries of the File menu and
  the Start page are two; their window starts with the software, Silinx or Xilinx ISE, and the import picks the one of
  the zip chosen. AMD Vivado and Intel Quartus are shown disabled: Silinx does not read or write their projects yet.

In detail:

- **One import and one export of a project's zip, the software chosen in the window (#3703).** Import / Export Silinx
  Project (.zip)… and Import / Export Xilinx ISE Project (.zip)… are Import Project (.zip)… and Export Project (.zip)…
  (Importar / Exportar Projeto (.zip)…), in the File menu and in the Start page's Project Commands. Their window
  (web/js/project-zip-dialogs.js) starts with a Software: row: Silinx (the whole project) or Xilinx ISE (its .xise and
  its sources; the import's project folder row with it), AMD Vivado and Intel Quartus disabled, their reason their tip
  (core/project-software.js). The import preselects the software of the files picked (a .xise, then a silinx.json, read
  from the zip's entry names); a Vivado or Quartus project's zip, or a zip of no project, is said under the fields. The
  choice last made is kept per viewer. The messages and documents that named the old entries name the new ones; the
  MCP tools import_project and export_project keep their names and kinds, their descriptions name the new entries.
