In detail:

- **The server's file system errors by the project's path (#3537):** writing a file onto a folder or through a file,
  or a rename through a file, answers 400 with the project's path ("'src/a.v' is a file, not a folder", "'src' is a
  folder, not a file") instead of a 500 with Node's message and the server's absolute path; a text that is no string is
  a 400 ("text: the whole text of the file", as the MCP's `write_file`); deleting a path where nothing is answers 404
  ("no file or folder 'x' in the project 'p'", as the MCP's `delete_file`) instead of ok; any other error of the system
  with no status is "internal server error", as the final handler says. One helper (`server/fs-error.js`) for the HTTP
  API and the MCP server. Tests: fs-error, server-api, mcp-sources.
