In detail:

- **A UI test waits for the start-up after a reload (#2528):** narrow.test.js's "Close Project shows the side panel
  again" checked the Start page as soon as the reload's wait ended, which is the start-up checks' answer; the Start
  page comes with the projects' list, later on a slow machine (CI). The test now waits for it, and holds the list a
  second (Chrome) so that it always comes late. No behaviour change.
