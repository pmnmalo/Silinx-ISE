In short:

- A design's link opened in the browser edition (the Pages site) keeps its pin assignments: the board emulator shows
  the top's ports on their pins and Implement has its constraints.

In detail:

- **A Silinx project imported in the browser keeps `constraints/top.ucf` (#2894):** the browser's import of a Silinx
  export (a design's link, a `.zip`) left out a file at the path of an empty project's default constraints,
  `constraints/top.ucf`, the I/O Pin Planning's and most examples': the pins were lost and the file reported missing.
  Every file of a Silinx export is now kept (`web/js/project-store.js` `projectFromZip`). Tests: a regression test, a
  link's round trip of every example with constraints in the browser's store, the MCP's `project_link` / `open_link`
  (the project only, a module's link, the emulator's: the same `.ucf`, board, device and top, implemented with the
  same pinout and warnings) and the page's (the emulator's every port on its pin, Generate Programming File with no
  warnings).
