In detail:

- **The configuration folder its owner's only, one that exists too (#3410):** when the server starts and when the
  configuration is saved, `~/.silinx` is made 0700 and its `config.json` 0600 when they are the user's own and were
  readable by others (a folder made before #2564, by hand or by an older version), with a line in the log saying so
  (`server/config-folder.js`; not on Windows).
