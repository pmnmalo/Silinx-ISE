In short:

- **Simulate Post-… Model only where the flow makes the models:** an iCE40, ECP5, Gowin or 7-series project's Simulation
  view, and the Tasks interface's model choices, no longer offer the Post-Synthesis … Post-Place & Route models, which only
  the Spartan flows (ISE's and the Silinx toolchain's) generate.

In detail:

- **The simulation models of the project's tool (#3707):** the Simulation view's SSim Simulator group lists the Post-… models
  the project's tool generates (`simModelsOf`, as Emulate on Board since #3704), and so do the Tasks interface's model
  choices, the Simulate task's bar's and SSim's toolbar's (`modelChoices`). The MCP server's `simulate` (a model) and
  `run_process` (a `…_model` process) refuse a model the flow does not make, with one message ("the iCE40 flow makes no
  post-synthesis simulation model …"), where `run_process` ran the synthesis alone and `simulate` said the model was not
  made. Tests: an iCE40, a Basys 3 and a Basys2 project's Simulation processes and Tasks model choices, in Portuguese, in
  both interfaces; the MCP's refusals, and its check against the interface's tools on every board.
