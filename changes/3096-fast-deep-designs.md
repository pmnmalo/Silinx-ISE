In short:

- **Optimization Fast is faster on deep logic:** a design limited by its logic depth is also synthesized as at Speed, and
  the faster netlist is kept (epfl-max 70.8 -> 25.2 ns, epfl-priority 44.1 -> 9.4 ns).

In detail:

- **Optimization Fast: a deep design synthesized as at Speed too (#3096):** a design of more than 16 levels of logic (1500
  LUTs at most) also gets Speed's synthesis, kept when 10 % faster by the estimate, as the old Normal did (#468). The log
  says the levels and both estimates. Other designs are synthesized as before.
