In detail:

- **A test run never writes the user's own configuration (#3420).** Runs had written a test's placeholder ssh settings
  (host, user, port, settings script) into the developer's `~/.silinx/config.json`, and ISE then went to that host.
  Saving the configuration (server/toolchain.js `refuseUserConfigInTests`) now refuses the account's own `~/.silinx`
  under `node --test` or a `*.test.js` file run alone, whatever HOME says, unless `SILINX_TEST_REAL_CONFIG=1`; a test
  sets `SILINX_CONFIG_DIR` to a temporary folder. test/config-isolation.test.js checks it, end to end in a child whose
  account's home is a temporary folder, and that the user's own file is left untouched.
