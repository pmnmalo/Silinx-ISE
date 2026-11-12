In detail:

- **A UI test's regular expression escaped completely (#3692):** `test/ui/project-name.test.js` escaped only `-` in
  the constant it builds a regular expression from (CodeQL's alert 182); it escapes every special character now,
  backslashes included. Test: ui/project-name, in both interfaces.
