In short:

- **A link given to a Silinx already running** saves your open documents only once the link is read, and asks first
  when one has changes not saved yet (Save and Open); a hash that is no link saves nothing.

In detail:

- **Links: the checks and the user's consent first (Fixes #3362):** a short link's gist is read from GitHub's answer
  with a running total, refused past `GIST_ANSWER_MAX` (or a larger Content-Length) before it is parsed
  (`core/gist-link.js`); a design link's files pass the import gate before any of its HDL is compiled or its drawings
  parsed, the HDL a drawing makes again made from the files the gate passed, then gated too (`core/design-link.js`); a
  link given to the running app (`web/js/link-hash.js`) saves the open documents only once it is read (a broken one,
  or a hash that is no link, saves nothing) and, when a document has changes not saved yet, once the user agrees in
  the Open from a Link dialog (Save and Open; a zip's link: its own dialog), before anything is compared or replaced
  (`web/js/link-open.js` openFromLink's `prepare`). Tests: gist-link (an oversized answer refused unparsed, its reading
  stopped), design-link (a refused file never compiled), ui/link-hash (the dialog, Cancel and a non-link save nothing).
