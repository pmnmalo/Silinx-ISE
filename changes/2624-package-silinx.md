In short:

- **The command is `silinx`:** `node bin/silinx.js serve` starts Silinx, and the launchers are `Start Silinx.command`
  (macOS), `Start Silinx.bat` (Windows) and `start-silinx.sh` (Linux). The old `bin/silinx-ise.js` still works for
  two releases, with a warning: an MCP configuration that names it should name `bin/silinx.js` now.
- **The downloads are `Silinx.html`, `silinx-<version>.zip` and `silinx-docker-kit-<version>.zip`.**

In detail:

- **The package, its command and the release's files named Silinx (#2624, part of the rename to Silinx):**
  `package.json`'s name is `silinx`, its commands `silinx` (`bin/silinx.js`) and `silinx-ise` (`bin/silinx-ise.js`,
  the old name: a warning on stderr, never on stdout where `mcp` writes its messages, then the same command);
  the launchers, the single-file edition, the app's zip and its folder, the Docker kit and the development
  build's files are named Silinx, as are the release's title and the ISE image's entrypoint
  (`/usr/local/bin/ise-entrypoint`; an image built before keeps working). The single-file edition's title says
  "(standalone)" again (lost when the page's title changed).
