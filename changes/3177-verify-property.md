In short:

- **Verify Property:** a state diagram's or an ASM chart's ⋮ menu has Verify Property…, which proves a property of
  the state machine for every input sequence: a state it never reaches, a state it reaches (the way there), or 1-bit
  outputs never 1 together. One that fails gives the first clock cycle where it does, and that counterexample becomes
  a test bench, simulated at once, the property reported by the simulation. In the browser too.

In detail:

- **Formal verification, its third part: a drawing's properties (#3177):** `core/verify-props.js` writes a copy of the
  drawing's HDL, `<module>_props` (its generator's, with its state register and its states' constants), with the
  property as an assertion (never: the state's constant never in the state register; reach: the same assertion, its
  counterexample the way there; exclusive: no two of the outputs 1), and proves it as Verify Assertions does
  (`core/verify-assert.js`): proved by induction, bounded (a warning), or failed. The project's own HDL is not changed.
  The counterexample's test bench, `sim/verify_<module>`, holds the copy and the bench (`core/verify-bench.js`'s new
  `prelude` and `checks`: the outputs' property is the bench's own check, on its signals, as XST reads no output port);
  its simulation reports the property at the cycle the proof found. The interface's Verify Property… (the state
  diagram's and the ASM chart's ⋮ menus, `web/js/verify-props.js`: the property, its state or outputs, and the depth
  asked) and the MCP server's `verify` with `property`, `state` and `outputs` give the same messages. Tests:
  verify-props (each property proved, failed or bounded, in a VHDL and a Verilog drawing, replayed at the same cycle;
  traffic's state diagram and blinky's ASM chart; the refusals; the copy), mcp-verify; UI verify-props in both
  interfaces and Portuguese, fsm and diagrams (the ⋮ menus).
