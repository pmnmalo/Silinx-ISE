In detail:

- **The release zip without the iCE40's nextpnr (#2570):** npm ci --omit=dev installed `@yowasp/nextpnr-ice40` all the
  same (an optional peer of the workspace silinx-fpga, devOptional in package-lock.json, which no --omit leaves out), so
  the zip was 106.8 MB against its 40 MB budget. The packaging now removes it after the install
  (`scripts/downloaded-packages.mjs`), as #2444 intended: the zip is 38.1 MB, and the package is downloaded on its first
  use. THIRD-PARTY-NOTICES.md keeps its notice, marked as downloaded, and the release test checks that it is not in the
  zip.
