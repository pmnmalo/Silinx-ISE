In short:

- **Two more guided labs:** "A state machine" on the traffic example (the state diagram, its simulation, a new output,
  the synthesis) and "The clock and the board" on blinky (the board and its clock, the simulation, the speed changed,
  Implement Design with its timing met, the bitstream), in English and Portuguese. A lab's step can now check a
  process: it is done once Synthesize, Implement Design or Generate Programming File has run on the sources as they are.

In detail:

- **Guided labs, the processes' checks and two labs (#3179):** a step's `process` check (`core/labs-check.js`): the last
  run's Design Summary (`build/reports.json`) says the process ran (synthesize, implement, bitstream) on the project's
  top, with the given number of warnings (none by default), its timing constraints met (`timing_met`), and on the
  sources as they are: in the interface while the Processes pane marks none of its steps out of date or failed, in the
  MCP server's `lab` tool while no file the implementation reads is newer than the run. The shipped labs "A state
  machine" (traffic) and "The clock and the board" (blinky).
