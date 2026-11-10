In short:

- A design's link pasted into the address bar of a Silinx already open (or reached with Back / Forward) now opens, as it does in a new tab.

In detail:

- A link given to the running app (the address's hash changed without the page loading again) is handled as at start-up (web/js/link-hash.js): a design's link through the same checks, size caps and questions (a zip from another site opened only once the user agrees, the same refusals and messages in the console); a shared project's link (#follow=, #edit=), or any link while a project is followed, by loading the page again. The open documents are saved first; one that cannot be saved keeps the link from opening, its changes kept; nothing opens while an implementation runs. An address's token (#token=, #code=) is left to its own handling (#3316).
