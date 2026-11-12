In short:

- **Share Module Live…** A module's right-click menu shares the project live opening on that module: its source
  opened in your page, and its link opening it in the followers'.

In detail:

- **Share Module Live… (#3631).** In a module's menu of the Design tree, after Share Module Copy… (Partilhar Módulo em
  Direto…), in the editions that share, disabled while following another's project: the project shared live as Share
  Project Live… shares it (the name asked first; the sharing already running otherwise), the module's source opened in
  the owner's page, which the followers follow, and its dialog's links opening on the module (`…#follow=…&top=<module>`,
  the editors' `#edit=…&top=…`; core/collab-link.js `withTop`). A follower who opens such a link opens the module once
  the project arrived, browsing alone on it (Follow <owner>, in the toolbar, follows the owner's editor). The MCP tool `share_project`
  takes `top` (a module of the design: its links), and `follow_project` says a link's module.
- **Follow <owner> brings the owner's editor back even when the owner has not moved (#3631).** Following again after
  browsing alone waited for the owner's next move: the view last followed was remembered as already shown.
