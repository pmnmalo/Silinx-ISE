In short:

- **C to HDL with an RTL blackbox:** a C source that does not use the project's blackbox is made into its module again,
  no longer refused for that blackbox.

In detail:

- **A blackbox only its own C sources' (#3022):** the synthesis of a C source takes only the descriptions (syn.blackbox)
  of the functions it declares; Check Syntax (in the interface and the MCP server's `check_syntax`) warns, once, in the
  description, of one whose function no C source of the design declares ("not used"; its C model not counted).
