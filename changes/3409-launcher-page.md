In detail:

- **The launchers' one-time code off the opener's command line (#3409):** `serve --open` gives the opener (`open`,
  `xdg-open`, `cmd /c start`) the path of a page in the configuration folder, readable by its owner only (0600) and
  deleted after the code's minute (or by the next launch), which sends the browser on to the address with its code,
  where the address itself, which another user of the computer reads in the opener's arguments, was given
  (`server/open-page.js`).
