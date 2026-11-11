In detail:

- **A change's title from a wrapped bold label (#3090):** `core/changelog.js changeTitle` reads a fragment's bold title
  wrapped onto a second line as one title, its lines joined, so the Development menu's changes no longer show its
  `**`; an item with no bold label (its first line the title) has its bold words' `**` taken out too. Tests:
  changelog (a wrapped title, alone and through `buildChanges`; an item with bold words and no label; the repository's
  fragments, three of which failed).
