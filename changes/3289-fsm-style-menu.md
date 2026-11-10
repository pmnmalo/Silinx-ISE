In short:

- The state diagram editor's Encoding and Coding Style are now in the toolbar's ⋮ menu. The status line still shows the
  encoding.

In detail:

- **The state diagram's Encoding and Coding Style in the ⋮ menu (#3289):** the state encoding (Binary, Gray, One-hot,
  Enumerated) and the style of the generated HDL (3 or 2 processes), settings rarely changed, are choices of the
  toolbar's ⋮ menu (a title, the options, a ✓ on the diagram's), no longer selects in the toolbar. An undo moves their
  ✓ back. A menu choice now follows a ✓ moved from outside, so the choice undone can be chosen again (`setChoice`,
  `web/js/toolbar-menu.js`).
