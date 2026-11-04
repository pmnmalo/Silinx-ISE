In short:

- **The Spartan-6's nextpnr engine in the browser:** a Nexys3 or Atlys project with the nextpnr engine chosen (Process
  Properties ▸ Place & Route Engine: nextpnr only) is placed and routed by nextpnr in the browser edition and the
  standalone page too, no longer only with the local server.

In detail:

- **nextpnr-himbaechel-spartan6 in the browser (#2288):** the flow's worker gives the Spartan-6's nextpnr engine its
  `io.nextpnr.spartan6`, from the package's bundle and the device's chip database (about 5 MB, fetched on its first use,
  then kept by the browser's cache). The local server serves the package at `/vendor/nextpnr-spartan6`, and the standalone
  build publishes it with the site's assets (`assets/vendor/nextpnr-spartan6/<its version>/gen` and `chipdb`, each file's
  SHA-256 in the page). When a project opens, the browser fetches nextpnr ahead only for a Spartan-6 project that chooses
  the nextpnr engine (its `auto` is still the Silinx engine's on the Spartan-6, #2131).
  - **Tests:** test/ui/standalone.test.js (traffic on the Nexys3 by nextpnr in the browser edition), test/web-open-flow-browser.test.js, test/asset-cache.test.js, test/family-profile.test.js.
