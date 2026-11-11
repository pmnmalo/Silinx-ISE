In detail:

- **`yosysNode` can be stopped (#3261):** given `{ signal }` (its fifth argument), it runs Yosys in a worker thread of its own, terminated when the signal aborts (the run rejected, `aborted: true`): Yosys's own `-timeout` does nothing in WebAssembly. Without a signal it runs in the process as before.
