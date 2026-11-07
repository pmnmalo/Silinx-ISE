In short:

- **A refused RTL blackbox is said:** a C source whose blackbox description no longer fits its RTL module keeps its
  Design row, marked No HDL, and the Console says why; Check Syntax of the C checks the descriptions too.

In detail:

- **Silinx HLS, a C source whose HDL cannot be made (#2995):** a C error or a refused RTL blackbox (a port the module
  does not have, a width that differs, a module not found) left the C's module out of the Design pane with no message.
  Its row now stays, with the C's badge and a No HDL badge that opens the first error's file, and its errors are written
  to the Console once. The project's top is kept, and Check Syntax of the design (and the MCP server's `check_syntax`)
  reports those errors instead of a missing top. Check Syntax of a C source also checks the descriptions of the
  blackboxes it calls, as its synthesis does, each message in its description.
