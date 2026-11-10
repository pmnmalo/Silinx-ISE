In short:

- **The logic analyzer in the design:** with a capture set (the MCP tool `capture_settings`), Implement in the Silinx
  toolchain inserts the capture core and its BSCAN on the Spartan-3E, and the Design Summary shows it. The design's own
  sources are not changed.

In detail:

- **The capture inserted at Implement (#3176):** `core/flow-ide.js runOpenFlow` gives the open flow, on the server and in
  the browser, the front end with the capture core and its wrapper (`captureFrontEnd`) when the project has a capture.
  The flow's log names the probes, the samples, the trigger, the block RAMs and the link. The report's `capture` is shown
  in the Design Summary's new Logic Analyzer table (English and Portuguese, `web/js/i18n-capture.js`) and returned by
  get_report. Only the Spartan-3E for now: on the Spartan-6 the front end refuses the capture with its reason. An ISE or
  Vivado run says it implements the design without the capture, since its wrapper reads the probes through
  hierarchical names. The simulation models stay the design's own.
- **The core's sample memory without a written, unread parity bit (#3176):** on the Spartan-3E the core keeps its
  samples in arrays no wider than the data bits of the widest block that holds the depth. Words that filled a block's
  parity bits (17 or 18 bits of 1024 samples, 9 of 2048, 36 of 512) made ISE's DRC warn (PhysDesignRules:1060); they now
  take one block more. Blinky with 29 probe bits implemented by the Silinx toolchain passes ISE's DRC with no error or
  warning, and its .bit is byte-identical with ISE's bitgen.
