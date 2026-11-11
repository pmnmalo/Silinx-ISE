In detail:

- **The ISE style's Start page test measures the entries shown (#3380):** test/ui/tasks.test.js's #1409 test counted the
  icons of the Teaching box too, which the ISE style hides (#3333): their width 0 failed it. It measures the entries
  shown only.
