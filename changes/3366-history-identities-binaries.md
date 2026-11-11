In detail:

- **The history's private-data scan reads the commits' authors and committers and the binary files (#3366):**
  `node scripts/check-private-data.mjs --history` also scans every commit's author and committer (name and
  address) and every binary or compressed file added or changed in the history, deleted ones too (`git log --raw`,
  then the blob through `scanBuffer`), which `git log -p` showed only as "Binary files … differ". Allowed: the
  maintainer's public commit addresses (by their SHA-256, not spelled out), GitHub's and the bots' no-reply
  addresses, and two old commits of the quality comparison whose committer was the self-hosted runner's local
  name (the history cannot be rewritten). Tests: private-data (an author's and a committer's address and computer
  name, a binary and a compressed file deleted since, the allow-list).
