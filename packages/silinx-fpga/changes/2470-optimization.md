In detail:
- `spec.synthGoal` of `runFlow`: 'fast' (the usual mapping alone, `FAST_SYNTH`; one placement, no register replication), 'area' (`synthesizeArea`: the smaller of the usual mapping's netlist and Speed's; one placement) or 'speed'; `synthGoal(impl)` and `GOAL_IMPL` between it and ISE's Optimization Goal and Effort (#2470).
