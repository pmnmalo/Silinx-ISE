In short:
- File ▸ Short Links…: your short links, when each was made and when it expires; those this browser made copied again; the ones you choose, or the expired ones, deleted.

In detail:
- Short Links… (#3635, `web/js/short-links.js`): the account's Silinx gists (`core/gist-link.js` listGists: only those whose description and single file are Silinx's, secret), the newest first, with their dates; this browser remembers the links it made (the project, the link: kept where its sign-in is), so that those rows show the project and can be copied again, a gist made elsewhere said to be; Delete Selected (`deleteGists`: any other gist refused before anything is deleted) and Delete Expired, each said in the console; opened from Copy Link's *Manage short links…* too (Portuguese labels). The server's `/api/gists` (its `GH_TOKEN`), the browser edition's through its sign-in; the MCP's `short_links` and `delete_short_link`. README, SECURITY.md.
