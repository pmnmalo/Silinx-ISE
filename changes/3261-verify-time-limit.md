In short:

- **Verify Equivalence, Verify Assertions and Verify Property** stop at a time limit (60 s by default, in their dialogs): a check that takes longer says how many clock cycles it had checked by then.

In detail:

- **A time limit for the formal checks (#3261):** Yosys's `sat -tempinduct` has no time limit in WebAssembly (its `-timeout` relies on a signal), so a long check kept the page's Yosys worker busy. Each check now has a time limit (the dialogs' Time limit (s), 60 s by default; the MCP tool `verify`'s `time_limit`): when it passes, Yosys's worker is terminated (the page's worker, `web/js/yosys-client.js`; on the server, a worker thread of its own, `yosysNode` with a signal) and the verdict says so: "the check did not finish in N s (its time limit): … in the first k clock cycle(s), not checked beyond them" (a warning; an error when no clock cycle was checked). The next check starts a new worker (`core/verify-limit.js`).
