In detail:

- **The local server's token only in its header (#3045):** `?token=` on the export downloads (`export.xise`,
  `export.zip`), which the page never used (it downloads them with the `X-Silinx-Token` header), is refused
  (`server/server.js`): an address stays in the browser's history, a shell's and proxies' logs; test:
  `test/server-api.test.js` (the query form refused with 403, the header accepted).
