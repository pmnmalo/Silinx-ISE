In short:

- **State diagram editor: a state's and a transition's outputs in a table.** The Properties list every output of the
  machine, with its name and width, and its value in this state or transition. Leave a value empty for the output's
  default.

In detail:

- **State diagram editor: a state's and a transition's outputs as a table of the machine's outputs (#3814).** The
  Outputs text box ("z=1, y=2'b10") of a state's and of a transition's Properties is replaced by a table: one row per
  output of the machine, its name and width (read-only) and its value (editable). An empty value leaves the output unset:
  its default in a state, the state's value on a transition (shown greyed in the field). A value is checked as it is
  typed (a constant that fits in the output's width): a value refused is marked, and when the field is left the console
  says why and the value in force comes back. An output renamed in the machine's Properties keeps its values in the
  states and transitions, and one removed takes its values with it. Files are saved as before (an unset output left
  out), so the generated VHDL and Verilog are the same for the same values (core/fsm-outputs.js). The MCP server's new
  `set_fsm_outputs` sets a state's or a transition's outputs with the same checks.
