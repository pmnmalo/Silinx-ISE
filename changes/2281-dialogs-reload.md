In detail:

- **Design Properties and Process Properties keep their choices during a project reload (#2281):** a reload ending while
  the dialog was open, or just after its OK, no longer brings back the previous values (a Preferred Language, an
  Optimization Goal); a reload reads the project once the saves asked before it are on the server.
