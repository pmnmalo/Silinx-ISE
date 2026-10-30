In short:

- Close Project shows the side panel (Design / Files / Libraries…) again when it was hidden, with the Start page in it.

In detail:

- **Close Project shows the side panel again (#2169):** a hidden side panel stayed hidden after File ▸ Close Project,
  the Start page out of sight. Now the project closed (`silinx:project-closed`, web/js/project.js) shows it again: in
  the modern interface Design's side panel open and no document maximized, kept (`closedState`, web/js/tasks.js) so the
  saved choice does not fold it again; on a narrow screen in the classic interface the drawer open, kept too
  (web/js/narrow.js). Tests: test/tasks.test.js (closedState), test/ui/narrow.test.js (both interfaces, at
  1400 × 900 and 820 × 1180, and after a reload).
