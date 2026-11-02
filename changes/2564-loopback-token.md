In short:

- **Only your browser reaches the local server:** it makes a token at every start, on this computer too, and the launchers
  open the address with it; another user of the same computer cannot use your projects or your board.

In detail:

- **A token at every start, on loopback too (#2564):** `serve` makes the token on every address and prints the address with
  it (`…/#token=…`), which `--open` and the launchers open; with a token every API request needs it, a local one too; the
  page keeps it for the browser, not the tab; the token is written to `~/.silinx/server-<port>.token` for its owner only
  while the server runs, so a second launch opens the running server.
