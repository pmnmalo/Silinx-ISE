In detail:

- **SECURITY.md: which settings and options the page sets (#3046):** the programs' paths and the arguments given to
  Docker and ssh come from the configuration file only (`FILE_ONLY` in `server/toolchain.js`); the page picks the
  build's mode, the ssh machine and user, the Docker image, and a programming tool with its options, all checked
  values (`server/programmer-values.js`). The text said which program runs, and with what arguments, never came from
  the page.
