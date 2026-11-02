In detail:

- **`web/js/api.js`'s `silinx-token` key through `prefKey` (#2597):** `web/js/api.js` (#2564) reads and writes
  `'silinx-token'` through `prefKey('silinx-token')`, keeping the same stored key and passing `test/web-prefs.test.js`.
  Test: test/web-prefs.test.js.
