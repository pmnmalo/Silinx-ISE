In detail:

- **The design corpus's expectations: the T80 meets its period (#1096):** since the T80 was routed faster (Refs #370,
  #651) its 20 ns PERIOD on clk_n is met, and the Nightly reported the warning "PERIOD 20 ns on clk_n not met" as
  vanished; `test/designs-corpus/expected.json` no longer expects it, and the README's results table follows (`run.mjs --table`).
