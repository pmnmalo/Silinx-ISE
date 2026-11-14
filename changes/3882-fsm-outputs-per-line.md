In short:

- **State diagram editor: outputs one per line, no Delete button in Properties.** A state's and a transition's outputs
  are drawn one per line, and a state or a transition is deleted with the Delete key or the toolbar's Delete.

In detail:

- **State diagram editor: a state's and a transition's outputs one per line; no Delete button in Properties (#3882).**
  In the drawing a state's outputs are written one per line under its name (the circle grows to hold them), and a
  transition's label is its condition followed by " /", then its outputs one per line, the label growing away from its
  arrow; a state's Properties list its transitions the same way. The Delete state and Delete transition buttons of
  Properties are gone: a state or a transition is deleted as any selection is, by the Delete key, the toolbar's Delete
  or Edit ▸ Delete. Only the display changes: the files, the generated VHDL and Verilog and the MCP server's tools are
  as before.
