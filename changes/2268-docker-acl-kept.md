In detail:

- **The ISE runner's access to Docker kept (#2268):** the agent `scripts/ise-runner/install.sh --docker-acl` installs
  took the runner user's ACL off Docker Desktop's socket and put it back on every run, and launchd ran it every 10
  seconds or so: for an instant each time the runner could not reach Docker, and a nightly ISE run failed one design
  on `permission denied`. It now adds the ACL only when the socket lacks it. Tests: test/ise-runner.test.js.
