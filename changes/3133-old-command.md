In short:

- **The old command `silinx-ise` is gone:** after its two releases with a warning, `bin/silinx-ise.js` no longer
  exists. Run `silinx` (`node bin/silinx.js`) instead, and in an MCP configuration that still names the old file,
  change it to `bin/silinx.js` (`node bin/silinx.js mcp`).

In detail:

- **The command's old name removed (#3133):** `bin/silinx-ise.js`, kept for two releases after the rename (#2624,
  15.23.0 and 15.24.0), and its `package.json` `bin` entry are removed, with its tests in test/cli.test.js and
  test/mcp.test.js; test/old-name.test.js lists no old file name any more and only the ISE runner's clean-up of its
  old launchd labels. Tests: cli (no `bin/silinx-ise.js`, `package.json` and `package-lock.json` naming only
  `silinx`), old-name (the counts lowered).
