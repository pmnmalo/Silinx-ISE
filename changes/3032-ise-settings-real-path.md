In detail:

- **The ISE settings script of the docker image or the ssh host never a file of the build folder (#3032):**
  Toolchain Settings refuses a `docker.settings` or `ssh.settings` with a `.` or `..` in it, or under `/proc`, `/dev`
  or `/sys` (`/proc/self/cwd/…` was the build folder by another spelling); `run.sh` sources `ISE_SETTINGS` only when
  its real path, every link followed, is outside the build folder, and otherwise stops with an error line.
