In short:

- **A design in a link, for lecture slides:** a link opens Silinx on a design, straight in Try it, the simulation or
  the board emulator. **Copy Link to Project…** (the project's menu in the Design pane, the Start page, the File menu)
  and **Copy Link to This Module…** make it, with the whole project inside the link; a link can also name an example
  or a project's zip hosted elsewhere. The student's changed project is replaced only when they say so.

In detail:

- **Opening a design from a link, Copy Link… (#2826, #2829):** at start-up the address's `#design=` /
  `#open=example:` / `#open=<https zip>` with `view=try|simulate|emulate` and `top=` opens the design in a project
  named after it (web/js/link-open.js) and then its view: the schematic's Try it running, the test bench simulated, the
  board emulator; the link cleared from the address. A project of that name with the same files is opened as it is,
  one that differs is replaced only on Replace (Keep Mine keeps it); a zip from another site is fetched only once the
  user agrees, with no credentials nor referrer, at most 16 MB. A broken or hostile link, or a view the design does
  not have, is an error in the console, the workspace as it was. Copy Link… (web/js/link-copy.js) shows the link as it
  is made, its length, and says when it is too long for some slide tools or too large for a link. The local server's
  token is now taken only from an address whose hash is the token alone, never from a link. In both interfaces, in
  Portuguese; `GET /api/templates/:name/files` (and the browser edition's) gives an example's files.
