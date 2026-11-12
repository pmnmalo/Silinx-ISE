In short:

- **The single file keeps the GitHub sign-in in its tab only:** Silinx opened from a file on the disk no longer
  remembers the sign-in in the browser, where any other page opened from the disk could read it.

In detail:

- **The single file's GitHub sign-in kept in its tab only (#3530):** at a `file:` address (`Silinx.html` opened from
  the disk, whose storage every local page shares) Sign in with GitHub… keeps the token in the tab's `sessionStorage`
  only, Remember me unticked and disabled with its reason as its tip, the dialog's note saying so; a token left in
  `localStorage` is not read; the site's editions as before. SECURITY.md says it. Tests: the sign-in's two ways at
  `file:`; the single file's dialog, its sign-in writing nothing to `localStorage`, in Portuguese too.
