In detail:

- **The 7-series' bit database from its JSON in the package's API (#3143):** `bitDbXc7` (fpga/xc7/bitdb.js) exported from
  src/index.js, for the browser edition's flow worker, which fetches and gunzips `bitdb/xc7/<part>.json.gz` itself (Node's
  `loadBitDbXc7` reads it from disk).
