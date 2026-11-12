In short:

- A link to follow a shared project given to a running Silinx is read first: a broken one is said in the console and
  saves nothing; a good one asks before your changes are saved, as a design's link does.

In detail:

- **A shared project's link given to a running Silinx is read before anything is saved (#3531):** a `#follow=` or
  `#edit=` hash is parsed first (core/collab-link.js `parseFollowLink`): a broken one is the console's error
  ("Follow a shared project: the link to follow is broken …"), the hash cleared, nothing saved and the page not loaded
  again; in the page that shares a project, the console's warning, nothing saved; a good one asks, when a document has
  changes not saved yet, "This link follows a project someone shares. Your open documents have changes not saved yet:
  save them, then follow it?" (Save and Follow, Cancel), then saves them before the page loads again. While a project
  is followed, another link is read first too: a broken one is said and saves nothing.
