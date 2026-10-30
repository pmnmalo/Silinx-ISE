In detail:

- **The research scripts' ssh does not hang (#2019):** the scripts under research/ that reach the ISE machine give
  every ssh and rsync `ServerAliveInterval=30`, `ServerAliveCountMax=4` and `ConnectTimeout=30`. `ise-remote.sh`,
  when the connection is lost during a run, fetches what it can, says so, exits with 1 and keeps the remote folder,
  so that missing logs are not read as verdicts. Test: test/ssh-keepalive.test.js.
