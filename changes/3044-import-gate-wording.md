In detail:

- **SECURITY.md: what the import gate does with a page or a script (#3044):** a text file whose content is an HTML
  page is refused; a file under its own extension (`.html`, `.js`) is kept opaque and an `.svg` as XML, never rendered
  as a page nor run (the server sends a file as `text/plain` with `nosniff`); the text said such files were refused.
