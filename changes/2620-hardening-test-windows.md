In detail:

- **A server hardening test skipped on Windows (#2620):** "a folder name that would end XST's quotes: refused" made a
  folder whose name holds a quote and a line break, which Windows refuses; the release CI's Windows unit tests failed
  on it. The check itself is unchanged. Test: test/server-hardening.test.js.
