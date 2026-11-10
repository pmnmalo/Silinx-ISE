In short:

- **A shared project's link pasted into a tab where Silinx is open** is followed, as in a new tab, with no need to
  reload the page.

In detail:

- **A follow link pasted into an open tab (Fixes #3318):**
  - **The link:** `…#follow=…` or an editor's `#edit=…`, pasted into the address bar of a tab where Silinx is already
    open, changes only the address's fragment, so the page did not load it. The page now loads it again, as a new tab
    does: the Follow dialog, then the project (`web/js/app.js`, `collab-follow.js` `followPasted`). The browser asks
    first when a document has unsaved changes.
  - **In the page that shares the project,** the link is not followed, since that would stop the sharing. A warning in
    the console says to open it in another tab or window.
  - **Tests:** UI collab (the owner's own page warned and still sharing; a follower's open tab following the pasted
    link; both interfaces), a regression test that fails on the old code.
