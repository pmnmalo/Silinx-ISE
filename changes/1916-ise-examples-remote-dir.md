In detail:

- **The ISE examples test over ssh in the folder Docker shares (#1916):** `test/ise/examples.test.js` builds in a folder
  of its own in `SILINX_ISE_REMOTE_DIR`, else the user's `ssh.remoteDir` (read before the test replaces the
  configuration), as `scripts/check-open-flow.mjs` does, instead of `~/silinx-ise-examples`, which Docker on the ISE
  machine does not share ("Mounts denied"); the configuration comes from `test/ise-examples-config.mjs`, tested
  without ISE.
