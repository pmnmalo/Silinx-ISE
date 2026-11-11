In detail:

- **The MCP's `import_project` never takes the exchange folder as a whole (#3412):** a `.xise` at the exchange folder's
  root (by default the user's Downloads), whose folder an ISE project's import copies, and the exchange folder itself
  given as a project folder are refused, the message saying to put the project in a folder of its own, where every
  file the gate accepted there was copied into the project and readable by the assistant.
