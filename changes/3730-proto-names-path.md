In detail:

- **`test/proto-names.test.js` runs on Windows (#3730).** It took the repository's folder from its file URL's
  pathname (`/D:/…`, read as `D:\D:\…` on Windows): `fileURLToPath` now, as `test/url-pathname.test.js` asks, which
  had failed on every operating system's unit tests since #3560.
