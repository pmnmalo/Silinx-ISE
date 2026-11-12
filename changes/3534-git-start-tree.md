In short:

- **Initialize Repository… and Sign in with GitHub… on the Start page and in the Design tree:** right-click the
  project or its device, or use the Start page's Project Commands, to make the project a git repository or to sign in to
  GitHub (the browser edition), shown only while they apply.

In detail:

- **Git's first commands where a project starts (#3534):**
  - **The Start page's Project Commands** have Initialize Repository… after Open from Repository… (disabled with no
    project open, as the exports, and gone once the open project is a repository) and, in the browser edition, Sign in
    with GitHub… while not signed in; in both interfaces. The page is drawn again when the project becomes a repository
    and after a sign-in.
  - **The right-click menu** of the project's row and of the device's row has the same two, where they apply, after
    Share Project… and before the Git submenu, which keeps them (and Sign out of GitHub).
  - Each runs the File menu's command (`gitStartItems`, web/js/git.js): the same dialog, checks and messages.
  - **Tests:** UI git (the Start page and both rows, run from each, gone once a repository, Portuguese), git-browser (the
    sign-in on the Start page and both rows, a cancel, gone once signed in, back once signed out, Portuguese), projects
    and collab (the Start page's commands).
