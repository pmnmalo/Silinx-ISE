In detail:

- **A test's selectors escaped in full (#2623).** test/silinx.test.js made a RegExp of each board emulator selector,
  escaping only `.` and `*` (CodeQL's js/incomplete-sanitization: a backslash was left as it was). Every RegExp character
  is escaped now, the backslash too, and the test checks it on selectors that have them. Tests: test/silinx.test.js.
