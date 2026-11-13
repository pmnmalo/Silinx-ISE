In detail:

- **The private-data check passes on GitHub's hosted runners' accounts (#3726).** `runneradmin` (macOS and Windows)
  and its short 8.3 name `RUNNER~1`, which a Windows fix's commit message named (#3611), are no one's home folder,
  as `runner` (Linux) was not already: CI's scan of the history failed on them.
