In detail:

- **dist/ no longer ignored by git (#524):** the single-file edition (Silinx-ISE.html) is a build output of the
  Release, dev-release and Pages workflows (`scripts/build-standalone.mjs` writes `dist/Silinx-ISE.html`), never a
  file kept beside the sources: the `dist/` line of .gitignore is removed, so a local build shows in `git status`
  and is deleted instead of lingering in the checkout. The build still writes to dist/, the workflows upload it
  from there.
