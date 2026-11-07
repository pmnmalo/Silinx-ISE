In detail:

- **SECURITY.md: the self-hosted ISE runner's Docker Desktop socket (#3033):** the runner's user reaches Docker
  Desktop's socket, which runs as the maintainer, so the socket is the runner's real boundary; the machine's Docker
  Desktop must share only the runner's work and cache folders, never the whole of `/Users`.
