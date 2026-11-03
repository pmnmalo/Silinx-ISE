In short:

- **A status line in the text editors:** the HDL (VHDL, Verilog), C / C++, UCF and other text editors, and their read-only
  views, have a status line at their bottom with the cursor's line and column and the language, as the drawing editors.

In detail:

- **The text editors' status line (#2763):** `createEditor` (web/js/editor.js) gives its editor a status line (the
  shared one of web/js/status-line.js), "Ln 5, Col 3" and the language, put under it by the HDL / C / UCF editor, a C
  source's HDL, a module's C model and the HDL translation; the cursor's place leaves the application's status bar.
