In short:

- **Templates in the FSM, ASM and Petri net wizards:** counters (regular, up/down, with enable, ring, Johnson) of N
  states, a sequence detector, a traffic light, a start/done controller, producer/consumer, mutual exclusion,
  fork/join, a semaphore…; the template fills in the inputs, outputs and states, which can still be changed.

In detail:

- **Templates (#2149):** the FSM, ASM and Petri Net wizards (New Source ▸ … ▸ Wizard >) start with a Template page,
  a template and its parameters (N, the pattern, overlapping or not, Moore or Mealy, the users), refused with a
  message when out of range; leaving it fills in the next pages (`core/chart-templates.js`, `web/js/template-page.js`).
  FSM: empty, counter, up/down counter, counter with enable, ring counter, Johnson counter, sequence detector, traffic
  light; ASM: empty, counter, up/down counter, start/done controller, request/acknowledge handshake (its state boxes
  renamed on the States page); Petri net: empty, cycle of N places, producer/consumer, mutual exclusion, fork/join,
  semaphore. Every template, in VHDL and in Verilog, makes a valid chart whose HDL compiles with no warnings; the
  counters, the detector (against a search of the bits) and the nets behave as said (`test/chart-templates.test.js`).
  The Petri Net Wizard's net builder moved to `core/chart-wizard.js` (`petriFromPorts`, still exported by
  `web/js/petri-wizard.js`).
