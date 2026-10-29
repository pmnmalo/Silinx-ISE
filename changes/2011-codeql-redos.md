In detail:

- **CodeQL's alerts since #585 reviewed (#2011):** the regular expressions that could take quadratic time on a long
  run of one character fixed: a port's and a clock period's text in the UCF (trimmed first), the back-annotated UCF's
  end, a base64 string's padding (a device's routing graph) and XDL's quoted strings (one with no closing quote is now
  an error, not words). A no-op replace in a test removed. The others are false positives, dismissed with their
  reason (paths through `projectDir` / `safeJoin`, XDL's escapes as ISE's, the tests' escapes of known strings).
  Tests: test/ucf.test.js, test/xdl.test.js, test/fpga-device.test.js.
