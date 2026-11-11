In detail:

- **ISE's settings script never comes from a build folder, an earlier one included (#3407):** a project's file named
  `settings64.sh` or `settings32.sh` (any case) is not copied into the build folder (`server/ise.js`: the build is
  refused with its reason), so no build folder left on the ssh machine holds one; `ssh.settings` and `vivado.settings`
  set through the API are outside every build folder used before (`ssh.earlierDirs`, remembered in config.json when
  `ssh.remoteDir` changes, which the API cannot change; past 100 folders, a new `ssh.remoteDir` is config.json's only);
  the device report's script checks `ISE_SETTINGS` as `run.sh` does (`server/settings-guard.js`, shared); `ssh.port` is
  a whole number from 1 to 65535 and `ssh.host` cannot start with `-`. SECURITY.md says so. Tests: build-settings (a
  settings script in a project, the build folders before, the port and the host, the device report's script).
