In short:

- **Trust for imported projects:** a project imported from a .zip, an ISE project, a design link or by the MCP server
  opens, is edited, simulated and implemented with the Silinx toolchain as before, but runs Xilinx ISE and programs a
  board or a PROM only once you trust it: the console says so when it opens, with a **Trust Project** button.

In detail:

- **Trust for outside projects (#2830):** `core/trust.js`. Every import marks the project `trusted: false` in its
  `silinx.json` (a zip's own `silinx.json` cannot say otherwise); the local server refuses Xilinx ISE
  (`/implement` with ISE), `/program` and `/prom` for it with a 403 and the reason, the browser edition its WebUSB
  programming, the MCP's `run_process` with ISE; saving the project's description keeps it untrusted (the server's
  `writeProject`, the browser stores' `saveProject`). `POST /api/projects/:p/trust` (the browser edition's
  `trustProject`) clears it: the console's line said when the project opens carries a Trust Project button (`log()`'s
  new `action`), "Confiar no Projeto" in Portuguese. No MCP tool trusts a project, by design (only the user, in the
  interface). SECURITY.md, GETTING-STARTED and COMECAR say so.
  - **Tests:** test/server-api.test.js (the refusals, a description written whole, the trust route, a project made
    here), test/project-store.test.js (both browser stores), test/mcp-transfer.test.js (run_process with ISE refused,
    no trust tool), test/ui/projects.test.js (the line and its button, in Portuguese, both interfaces),
    test/ui/standalone.test.js.
