In detail:
- **A release's CI in about 45 minutes instead of 80 to 120 (#3124):** the unit tests in five parts on Linux, all of
  them; on macOS and Windows in three parts, but the toolchain's heaviest (`HEAVY` in scripts/test-shard.mjs, its new
  option `--light`: the whole open flow on every feature, device and example, the post-place & route and Spartan-6
  models of the examples, the synthesis on the corpus, nextpnr's engine), about half the time, which took their parts
  to 60 to 80 minutes there; test/open-flow.test.js (blinky to a bitstream, the shipped devices) stays their smoke test.
  The runs of the tags one at a time: the IDE's and the toolchain package's tags pushed together shared the 20 jobs a
  public repository runs at once and queued them up to 50 minutes (v15.22.0). test/timings.json refreshed from
  15.23.0's run (schbeautify-sheet.test.js weighed 30 seconds, took 22 minutes). CLAUDE.md says so.
