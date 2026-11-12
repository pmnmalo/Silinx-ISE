In short:

- **One rule for a project's name.** The New Project wizard now takes the names the server takes (`lab-1`, up to 64
  characters) and refuses the others with the server's message; a name in another case than an existing project's is that
  project; the imports suggest a valid name from the file's (`2026-lab.zip`: `p_2026-lab`).

In detail:

- **A project's name: one rule, one message, one name from a file's (#3538).** The wizard checked a module's rule
  (`lab-1` refused, a name of 70 letters let through to the server's "invalid project name"), compared the existing
  projects in the exact case, and the two imports made a name from the file's in two ways, one of them a name the
  server refused. core/project-name.js now holds the rule and its message ("invalid project name '…': a letter, then up
  to 63 letters, digits, - and _"), `projectNameFrom` and `sameProject`, used by the wizard, the import dialogs, the
  browser's stores, the local server, the design links and the MCP server (new_project, open_link). Creating a project
  whose name differs from an existing one only in case is refused on every system ("project 'a1' already exists"), as a
  case-insensitive file system makes it the same folder. Portuguese for the message and for Replace Project.
