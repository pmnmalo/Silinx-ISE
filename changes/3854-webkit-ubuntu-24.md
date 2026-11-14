In detail:
- **CI: WebKit's jobs on Ubuntu 24.04 (#3854, #3855):** `browsers` and `webkit-standalone` run on `ubuntu-24.04`:
  `ubuntu-latest` became Ubuntu 26.04 (its image of 2026-11-11), whose libicu 78 Playwright's WebKit cannot load
  (`libicudata.so.74`), so WebKit stopped at its start. Test: test/ci-workflow.test.js.
