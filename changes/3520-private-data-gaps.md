In detail:

- **The private-data checks' gaps (#3520):** `scripts/check-private-data.mjs` flags a tailnet's name (MagicDNS,
  `*.ts.net`), a `.local` / `.internal` name with no hyphen or digit in quotes, right after `=` or a colon or as a YAML
  value, and a login on a computer named with no domain (`user@name`) after ssh / scp / sftp / rsync / mosh, `://` or as a
  YAML value; reads UTF-16 text, the files of a `.zip` (and the formats built on it), `.tar`, `.tgz` and `.tar.gz`, and
  refuses another archive, or one it cannot read, unless allowed; the history scan reads a file whose path git quotes
  under its own name (its lines were filed under the file before it); the scanner and its test are scanned too, with
  their own allow-list entries. `scripts/report-failure.mjs` cleans a tailnet's name out of a log line. Tests:
  private-data, report-failure.
