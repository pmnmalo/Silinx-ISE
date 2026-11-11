In detail:

- **The workflows' reports write only on the bot's own issue or comment, and outside text inert (#3417):** the
  failure report (`scripts/report-failure.mjs`) and the pinned sources' (`scripts/check-pins.mjs`) take an open issue
  of their title only when `github-actions[bot]` opened it, and the Yosys and nextpnr update reports
  (`scripts/yosys-update-report.mjs`) update only the bot's comment that starts with their mark: one of the same title
  or start by anyone else, which its author could edit or close, is not taken. A job's log lines go into a code block,
  and the Yosys test designs' results, new warnings, timed-out files and tag into code spans, whose fences no backtick
  of the text closes (`scripts/github-text.mjs`): no markup, link or @mention from a log or an artifact.
