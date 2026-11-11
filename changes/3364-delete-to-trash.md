In short:

- **Delete File… and Delete Folder…** move the file or folder to the workspace's `.trash` folder, from where you can
  move it back, as Delete Project does; the console says where.

In detail:

- **Delete File / Delete Folder into the workspace's .trash (Fixes #3364):** the interface's Delete File… and Delete
  Folder… (the route's `trash=1`) and the MCP's `delete_file` move the file or folder to
  `.trash/<project>-<time>/<its path>` (`server/projects.js` deleteFile `{ trash }`), as `delete_project` moves a
  project; the console line and the tool's result name that path (`trashed`), and the dialogs say it. The browser
  edition's folder store does the same in its folder's `.trash`; its browser storage, which has no `.trash`, still
  deletes for good and says so. Silinx's own deletions (a drawing's HDL made again, a conversion) delete as before.
  Tests: delete-trash (the route and the MCP: a file, a folder, the other files as they were), mcp-sources,
  project-store (the folder store), web-i18n (the dialogs in Portuguese), ui/files-delete and ui/projects (the
  dialogs, the console lines, the files in .trash).
