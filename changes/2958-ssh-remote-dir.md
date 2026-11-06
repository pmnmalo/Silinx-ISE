In short:

- **ISE over ssh:** the remote build folder set in Toolchain Settings is a folder inside the remote home; an absolute
  one is set in the configuration file.

In detail:

- **The ssh build folder kept inside the remote home (#2958):** every ISE run over ssh removes and remakes
  `<ssh.remoteDir>/<project>` on the build host; through the API (Toolchain Settings) `ssh.remoteDir` is now a folder
  inside the remote home (an optional `~/`, then no leading `/` or `-`, no other `~`, no `..`), an absolute folder is
  set in `~/.silinx/config.json` only (kept when the dialog sends it back unchanged), and a folder starting with `-`
  is refused whatever sets it.
