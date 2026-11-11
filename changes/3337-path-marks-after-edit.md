In short:

- **Show Path's marks after an edit:** a marked line of a file you edit turns faint (a dashed bar) and says it is from
  the timing analysis before the edit; a new timing run's report takes the old marks off.

In detail:

- **The path's marks and the edits (#3337):** `web/js/editor.js`'s path marks (#3178) turn faint on a file's first edit,
  still following the text, with the tooltip "From the timing analysis before this edit" (`marksStale`); the Paths
  panel, opened on another analysis of the same report than the one the marks came from, takes them off (the editors'
  lines, the drawings' elements, the FPGA view's path: `clearPathMarks`). Test: UI timing-paths (both interfaces,
  Portuguese).
