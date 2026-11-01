In detail:

- **CI: the UI parts' time limit (#2462):** a part of the UI tests may take 40 minutes (the job 45), not 25: two parts of
  the ISE-style interface ran out of time at silinx-fpga 0.1.6's release with their tests passing. Test:
  test/ci-workflow.test.js.
