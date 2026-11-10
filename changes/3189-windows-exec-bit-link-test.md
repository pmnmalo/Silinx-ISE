In detail:

- **Two tests that failed the tag's CI of 15.24.0 again (#3189, #3174):** `test/vivado.test.js` checks `run.sh`'s executable bit only
  where the file system has it (not on Windows), as `test/impl.test.js` does; the UI test of a redirecting zip
  (`test/ui/design-link.test.js`, #3042) passes the application's own `/api/` requests to the real fetch, unrecorded, so
  a late `/api/workspace` no longer lands in the list of the link's fetches.
