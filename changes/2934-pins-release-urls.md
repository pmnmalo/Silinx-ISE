In detail:

- **The monthly Pins check follows the Spartan-6 nextpnr package (#2934):** a package pinned by a GitHub release's
  tarball (`@silinx/nextpnr-himbaechel-spartan6`, `…/releases/download/spartan6-vX.Y.Z/…`, in both package.json
  files), which Dependabot does not follow, is compared with its repository's latest tag of the same prefix
  (`spartan6-v*`), and listed in the "Pinned sources" issue when it is behind (scripts/check-pins.mjs).
