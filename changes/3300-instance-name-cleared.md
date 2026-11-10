In short:

- **Schematic editor: an instance's name cleared:** emptying an instance's name, in its Properties or in Rename…, gives
  it back an automatic name (`inst_n`), which is not drawn; Undo restores the old name.

In detail:

- **An instance's name cleared is a fresh automatic `inst_n` (#3300):** core/schname.js chooses it (`autoInstName`:
  after the `inst_n` and `XLXI_n` of the other instances, skipping a name another instance or an I/O marker has, in
  any letter case; `instName`, `nameUnnamed`), shared by the editor (a new instance's name too, #311) and the MCP
  server; Rename… no longer refuses an instance's empty name, and the Properties panel's Instance name field no longer
  keeps the old one; an I/O marker's or a net name's empty name is still refused. The MCP's write_file gives a
  schematic's instance with an empty name its automatic name, said in its result (`named`).
