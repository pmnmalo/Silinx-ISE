In short:

- **A project opened right at start-up stays open:** a project opened while Silinx was still starting is no
  longer replaced by the last project, reopened over it.

In detail:

- **The start-up does not reopen the last project over one opened meanwhile (#2492):** the start-up reopened
  the last project once the list of projects came back. That list could come after the start-up checks
  (`startupChecked`), and so after a project opened meanwhile (from the Start page, or by a UI test). The
  start-up then closed that project's documents, its Design Summary among them, and opened the last project.
  This made the Tasks UI tests "the message centre" and "#2492 … a document closed" time out on CI, waiting
  for the Design Summary. A project asked for now keeps its place (`projectRequested()`, web/js/project.js;
  web/js/app.js). Test: test/ui/app.test.js (a regression test that holds the list until that project is open
  and fails on the old code).
