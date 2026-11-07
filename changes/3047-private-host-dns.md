In detail:

- **SECURITY.md: a link's `open=` address judged by its host name (#3047):** a public name that resolves to a private
  address passes the check, which reads no DNS; being `https:` it cannot reach the local server, which serves plain
  `http:`.
