In short:

- **A link opens Silinx as you had it:** Copy Link… includes the current view: the open tabs, the one in front, the
  split and, in the Silinx interface, the task, the side panel, the messages and a maximized document.

In detail:

- **The view in a design's link (#2886):** Copy Link…'s Include the current view (checked) adds `ui=` to the link: the
  open documents' reopen keys, the one in front, the split's right side, the left page, the Design view and the Silinx
  interface's task and arrangement (core/design-link.js `encodeUi`). Opening the link reopens them as a reload does
  (web/js/view-state.js `applyViewState`), then the link's own view; the layout is for that page only, over the
  viewer's kept one (web/js/tasks.js `applyLayout`), which a change of theirs keeps. Untrusted as the rest (#2829):
  only documents of the known kinds naming the project's files and modules, known pages, views and tasks, booleans,
  at most 40 documents and 4000 characters; what is left out is said in the console.
