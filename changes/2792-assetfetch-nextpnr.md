In short:

- In the browser, nextpnr and its chip databases are read from this browser's copy once downloaded, as Yosys is, also
  where the site's service worker does not answer (the first visit, before it controls the page; a browser without it).

In detail:

- **The browser edition's cache reads nextpnr's files (#2792).** `assetFetch`, the flow worker's and the Yosys workers'
  fetch that reads and fills Cache Storage, had its own pattern of the versioned assets, written before nextpnr: Yosys,
  the device descriptions and the bit databases, not nextpnr's bundles nor its chip databases
  (`vendor/nextpnr-spartan/<version>/gen|chipdb/`, `vendor/nextpnr-spartan6/…`). A project's prefetch put them in the
  cache, but where the service worker did not answer (it reads the same cache), every run fetched them again. One pattern now, `VERSIONED_ASSET`, for `isVersionedAsset`
  and `assetFetch`; `assetFetchSource` writes it into the Yosys workers' code as a literal.
  - **Tests:** test/asset-cache.test.js (nextpnr's files of both families, prefetched, read with no request, in the flow
    worker and in a Yosys worker's code; a miss kept; `assetFetch` and `isVersionedAsset` agree on every URL, failing on the old code); test/ui/standalone.test.js (#967:
    nextpnr's files counted among the versioned assets Implement must not fetch, and those a run with an empty cache downloads).
