In detail:

- **The workflows' check of the self-hosted runner reads `runs-on` as a mapping too (#3037):** a job whose
  `runs-on:` has no value on its line (its `labels:` or `group:` below it) or is a `{ … }` mapping is refused
  whatever it names, as is a `labels:` / `group:` key of a job outside its `concurrency:`; before, such a job was
  neither flagged nor checked for the guard of `main` (test/workflows.test.js).
