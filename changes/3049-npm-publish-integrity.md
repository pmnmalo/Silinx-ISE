In detail:

- **The toolchain package's publishing installs npm 11.21.0 checked by its integrity (#3049):** Node 22's npm (10)
  is too old for npm's trusted publishing (11.5.1 or later), so the publish job still installs npm, now from its
  registry tarball checked against the sha512 integrity pinned in `silinx-fpga-release.yml` before the job's
  OIDC token publishes, instead of `npm install --global npm@11.21.0` by its version alone.
