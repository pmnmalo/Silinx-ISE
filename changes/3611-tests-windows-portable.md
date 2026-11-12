In detail:

- **Tests that run on Windows too (#3611, #3613, #3616):** a module imported by its file URL, never its path
  (config-isolation, silinx-hdl-package); the classroom template's files by their `/` paths; no folder named `GIT~1`
  (on Windows `.git`'s own short name exists: hidden-short-names); Python 3's path as Python names it (ila-board); the
  history scan's file named with `"` and a backslash only where a name can have them (private-data); the child's
  account's home in `USERPROFILE` too, which Windows's `os.homedir` reads (config-isolation); a filter's path with `/`
  in git's configuration, where a backslash is an escape (git); #3412's expected paths with `/` after the exchange
  folder's name, as the results now give them (mcp-exchange-paths).
