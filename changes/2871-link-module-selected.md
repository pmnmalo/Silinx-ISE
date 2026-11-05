In short:

- **A link to a module opens on it:** Copy Link to This Module… with "Open the project only" opens the project with
  that module selected in the Design pane and its source open.

In detail:

- **A link's module selected (#2871):** a link's `top=` selects its module's row in the Design pane (its parents
  expanded, scrolled to) and, with no view, opens its source as a double-click does (its drawing, else its HDL); with
  a view, the module is selected and the view opens as before. The Design pane's module rows carry their module's name
  (`data-module`). Copy Link to This Module… always puts its module in the link, the project's top too.
