In detail:

- **MCP server: every tool call's arguments checked against the tool's schema (#3535):** besides the missing and the
  unknown arguments, each value's type, enum, minimum, an array's items and size and an object's properties are checked
  before the tool runs (`server/mcp-args.js`), one message for every tool naming the argument and what it must be
  (`language: one of vhdl, verilog`, `ports[0].msb: an integer`, all the wrong ones together). A wrong value no longer
  reaches a tool: `new_source` wrote the Verilog template into a `.vhd` file for a language neither, `set_design_properties`
  wrote any synthesis tool into `silinx.json`, a number for a name gave JavaScript's own error. `simulate`'s forces
  declare what they took already (a time or a value as a number). `new_project` with a variant and no board says so as
  `set_design_properties` does, an unknown board pointing at `list_devices`. Test: mcp-args (each kind of wrong value,
  nothing written; every tool's schema of the kinds checked).
