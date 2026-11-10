In short:

- **Browser edition:** a follower's page opens the shared project again, whether it found the owner at the meeting
  point or by the codes (it stayed on "No project open", with a read-only error).

In detail:

- **A follower's page in the browser edition opens the shared project (Fixes #3320):**
  - **The cause:** at start-up, the browser edition asks where its projects are kept (`api.initStorage()`,
    `api.storage()`). The follower's backend (`web/js/collab-follow-api.js`) refused both as read only, which stopped
    the start-up before the followed project was opened.
  - **The fix:** the follower's backend answers the storage's information as it is (it only reads it) and reopens no
    folder.
  - **Tests:** UI standalone (the site: the owner shares, a follower opens the link and the project opens, no warning
    nor error; both interfaces; fails on the old code).
