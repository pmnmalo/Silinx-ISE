In short:

- **Tasks ▸ Simulate:** choosing the model (Behavioral, Post-Synthesis … Post-Place & Route) or the test bench simulates
  it at once (a model not generated yet is offered to be generated first); the Simulate button beside them is gone.

In detail:

- **Tasks ▸ Simulate: a choice simulates; no Simulate button (#1018):** the task's bar's model and test bench choices
  run the simulation as soon as they change (web/js/tasks-sim.js), through `runSimulation`, which offers "Generate and
  Simulate" for a model not generated yet (#490); a choice made while another simulation is being prepared replaces
  it (`runSimulation`'s `stale`: the earlier one opens no window). The task's bar has no Simulate button in Simulate
  (web/css/tasks.css); the task's page keeps its own. The modern and classic interfaces are unchanged.
