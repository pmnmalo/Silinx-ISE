In short:

- **Boolean algebra:** the canonical SOP and POS say their terms, literals and gates, and their circuit's gates and delay,
  as the minimal forms do.

In detail:

- **The canonical forms' cost (#3072):** under each canonical form, "N term(s), N literal(s); gates: … AND, … OR, … NOT
  (… gate inputs)" and "As a circuit: N gate(s), delay N", counted as the minimal forms' (core/logic-canon.js); the MCP
  server's results view gives their terms and literals, and its data their gates.
