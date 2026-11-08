In detail:

- **A bitstream of the workspace named by its absolute path is programmed only when its project is trusted (#3039):** POST /program with an absolute `bitfile` in the workspace (by its name or through a symbolic link)
  takes the trust of the project the file is in, with or without a project in the request, and refuses it with the
  project route's message (403); a file of the workspace in no project is refused; a `.bit` outside the workspace
  (iMPACT's file box: a file from the disk) is programmed as before (`server/impl-routes.js` checkWorkspaceBit).
