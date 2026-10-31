In detail:

- **The nextpnr engine's tests on Windows (#2335):** a file URL's `pathname` (`/D:/…`) was passed as a file path by
  packages/silinx-fpga/test/nextpnr-engine.test.js and nextpnr-hard.test.js, test/ui/open-toolchain.test.js and
  research/s3e-place/fixtures.mjs: they use `fileURLToPath` now, and test/url-pathname.test.js keeps it so.
