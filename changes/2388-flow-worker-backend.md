In detail:

- **A family's back end tested in the browser's worker (#2388):** the browser edition's io of the Silinx toolchain's flow
  (the files in memory, each line, file and report posted to the page) is a module of its own,
  `web/js/open-flow-worker-io.js`, which the flow's worker uses; a UI test runs a fake family with its own steps through it
  in a module worker: its files in memory, its report, an earlier run's file read again, no warnings.
