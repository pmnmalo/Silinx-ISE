# Working on Silinx ISE

Silinx ISE is an ISE-like FPGA IDE for teaching digital systems (Spartan-3E boards: Basys2,
Nexys2). It runs in the browser or as a local server, with its own open toolchain (Yosys WASM,
pack, place, route, bitgen) and optionally Xilinx ISE 14.7. These are the project's rules for
anyone changing it, people and AI agents alike. The README and docs/ describe the product;
[ONBOARDING.md](ONBOARDING.md) adds the setup, how several Claude sessions work together, a map of
the code and the lessons learnt.

## Development

- **Every bug, feature or to-do is a GitHub issue** (labels: bug / enhancement / documentation, plus
  an area label), even when it is fixed at once. The fixing commit says `Fixes #N`. Issues are
  public: no personal data, no hosts or addresses, no course projects' code.
- **Every change ships with its own tests**:
  - core logic: unit tests in `test/*.test.js` (node:test), covering normal cases, edge cases and
    error paths; compare computed results against an independent reference where possible;
  - anything visible in the app: a UI test in `test/ui/*.test.js`, which must pass in both
    interfaces (modern and classic), and in Portuguese when it adds labels;
  - generated HDL: compiled, elaborated and simulated, in VHDL and in Verilog;
  - a bug fix: a regression test that fails on the old code.
- **Tests assert the warnings too**: the exact expected warnings of every flow (Check Syntax,
  simulation, synthesis, implementation, ISE), or an explicit "no warnings", never only "no errors".
- **The examples are the test designs**: gates, traffic, blinky, pong, stopwatch, clock,
  vga (`examples/`, in that order). Each must run on every device of the Silinx toolchain
  (Basys2-100/250, Nexys2-500/1200) and build with ISE with no warnings. A new source style or
  feature should be exercised by an example where it fits.
- **ISE is the oracle** for the open toolchain: byte-identical `.bit` and a clean DRC
  (`npm run check:open-flow`). For language questions XST's Spartan-3E behaviour is the reference.

## Programming

- Write code that reads like the code around it: its comment density, naming and idiom.
- Every label of the interface has a Portuguese translation in `web/js/i18n.js` (anchored patterns,
  `^…$`); `test/web-i18n.test.js` checks it.
- The Design pane shows one row per module: its drawing (schematic, ASM, FSM, truth table, Petri
  net) is the base and its HDL file is always generated from it; the badges show the drawing first,
  `[VHDL]` / `[Verilog]` last.
- Never commit Xilinx files: ISE itself, its Docker image, or ISE's raw outputs (`.bit`, `.ncd`,
  `.xdl`, `.xdlrc`, logs). The routing graphs in `core/fpga/devices/` are shipped for the supported
  boards only.
- Licence: AGPL-3.0-only with the elkjs permission (NOTICE). Keep NOTICE and THIRD-PARTY-NOTICES in
  sync when dependencies change. Copyright lines: "Copyright 2026 Pedro Maló".

## Integration

- Work is done on branches (agent worktrees under `.claude/worktrees/`), rebased on `origin/main`.
- **Tests while working, locally**: only the tests related to the change (the files it touches and
  their neighbours), a few at a time; no full suites and no parallel stress runs on the developer's
  machine. To check a fix against load, use `SILINX_UI_THROTTLE` on one or two processes.
- **CI runs at a release only** (#607): not on pull requests nor on pushes to `main`. Push the branch and
  open a pull request (`gh pr create`, its description saying `Fixes #N`) for the record and the review.
- **Merging**: when the tests related to the change pass locally, merge it into `main` (rebased,
  fast-forward, no merge commit; rebase the branch first if `main` moved). A break found later (by the
  release's CI, the nightly or ISE runs, the CI watcher) becomes an issue, fixed in the next change.
- **Reviewing** another session's pull request: its intent and its evidence, not every line. Does it do
  what its issue asks and nothing more; do its tests prove it (a regression test, the warnings asserted);
  does it keep the rules above; is its changelog fragment right. Read the lines closely only where the
  risk is: the project lifecycle, the board and PROM programming, the bitstream, security, the workflows.
- **During a release** nothing merges to `main` until the releaser says the tag is pushed: a merge in
  between moves `main` under the release commit and the tag has to be redone.
- **Dependencies** (`.github/dependabot.yml`): Dependabot's weekly pull requests are merged as any other.
  A **"yosys update" pull request is never merged on green alone**: the maintainer (or the session) reviews
  the comparison `yosys-update.yml` writes (the open synthesis's size and speed with the new Yosys and
  the base's, Yosys's test designs against their expectations), and the user decides. After merging, the
  quality comparison against ISE is run by hand (Actions ▸ Quality ▸ Run workflow) and reviewed. The
  sources pinned outside npm are checked monthly (`pins.yml`: one issue lists what is behind).
- **`main` is protected** (repository rulesets): no deletion and no force push, for anyone; a linear
  history, rebase merging only; no check is required to merge (CI runs at a release only). The weekly quality
  comparison cannot push to `main`: it pushes its results to the branch `quality-results`, which a
  maintainer merges.
- **CI** (`.github/workflows/ci.yml`) runs everything when a version tag `v*` is pushed, and by hand
  (Actions ▸ CI ▸ Run workflow): the unit tests on Linux, macOS and Windows, the UI tests in both
  interfaces, Firefox / WebKit, the operating systems' smoke tests, WebKit memory, the standalone build,
  the release zip. The unit tests run in three parts of about the same time (`scripts/test-shard.mjs`, by
  `test/timings.json`; refresh it now and then with `node scripts/update-test-timings.mjs <run id>`). The
  development build and the site's `dev/` are published after every push to `main` (no tests).
  The security checks
  (#498, `SECURITY.md`): CodeQL analyses the JavaScript (`codeql.yml`, a workflow of its own, on every
  push to main), Dependabot's alerts report a dependency with a known vulnerability, and CI scans the
  tagged commit's history for
  private data (`scripts/check-private-data.mjs --history`, HEAD's history only, #555; a harmless match goes to its `ALLOW` list with its reason).
  The ISE tests (nightly) and the quality comparison against
  XST (weekly) run on a self-hosted runner, only when main changed since their last run.
- **The changelog**: every change adds its own fragment, `changes/<issue>-<slug>.md`, and never edits
  CHANGELOG.md (whose edits made every pull request conflict): an optional "In short:" list (what users
  notice) and the "In detail:" list (the change, with its issue number). The format is in
  [changes/README.md](changes/README.md); `test/changelog-fragments.test.js` checks it.
- **Releases**, only when asked:
  1. `node scripts/changelog-release.mjs X`: the fragments assembled into CHANGELOG.md's `## X` section and
     deleted; edit the section if needed (an introduction, a shorter "In short:");
  2. `npm version X --no-git-tag-version`, then `node scripts/sync-version.mjs` (it refuses a version with no
     section or with fragments left);
  3. commit `core/version.js`, `package.json`, `package-lock.json`, the CHANGELOG and the deleted fragments;
  4. tag `vX` and push; the tag starts CI, and the Release workflow publishes the release once that run has
     passed (it does not run the tests itself; the commit must be on `main`).

  The Pages site serves the latest release at the root and `main` under `dev/`.
