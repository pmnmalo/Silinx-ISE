In short:

- **Set as Top Module on a module another one instantiates:** the Design pane now shows it as the top, first, with
  the top's icon and its sub-tree under it, as ISE does; its former parent stays a root after it.

In detail:

- **The top always a root of the Implementation view (#2877):** the hierarchy's roots are the top module, first, then
  the modules no module of the view instantiates (`implRoots`, core/elaborate.js, read by the Design pane's
  `viewRoots`); a top another module instantiates was an instance row only, with no top icon nor style. Its other
  appearances under other modules are plain instance rows; setting the top back on the parent restores the tree. The
  processes, Check Syntax, synthesis and the MCP server's `set_top` / `project_info` work on the same top.
