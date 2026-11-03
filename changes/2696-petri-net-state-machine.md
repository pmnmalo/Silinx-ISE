In short:

- **A Petri net's state machine:** a Petri net's row in the Design pane has an **FSM** badge (and its badge's
  menu, View State Machine (FSM)) that shows the net's state machine, read-only: a state for each marking the
  net can reach, the conditions on its arrows made from the guards.

In detail:

- **A Petri net's state machine, from its state space (#2696):** `core/petri-fsm.js` `petriToFsm(net)` explores
  the markings the hardware reaches (the clock step: every enabled transition whose guard is true fires, in
  priority order; `clockStepBy`, shared with `clockStep`), a Moore state for each (and for each set of the
  transitions with pulse outputs that fired at the last edge, the pulses being registered), its outputs the net's;
  a transition to each next state, its condition the guards' combinations that lead there, minimized
  (Quine–McCluskey), the combinations no input value gives as don't cares. The machine runs as the net, cycle by
  cycle. The FSM editor has a read-only mode (moved about, zoomed, its states selected, their marking shown, its
  tables and simulation; nothing edited); the Design row's **FSM** badge, between the net's and its HDL's, opens it.
