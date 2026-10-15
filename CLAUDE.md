# Working on Silinx ISE

Silinx ISE is an ISE-like FPGA IDE for teaching digital systems (Spartan-3E boards: Basys2,
Nexys2). It runs in the browser or as a local server, with its own open toolchain (Yosys WASM,
pack, place, route, bitgen) and optionally Xilinx ISE 14.7. These are the project's rules for
anyone changing it, people and AI agents alike. The README and docs/ describe the product.

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
- **The examples are the test designs**: gates, traffic, blinky, pong, stopwatch, clock
  (`examples/`, in that order). Each must run on every device of the Silinx toolchain
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
- **The full suites run on GitHub**: push the branch and open a pull request
  (`gh pr create`, its description saying `Fixes #N`). CI runs everything on it.
- **Merging**: when the pull request's CI is green, merge it into `main` (rebased, fast-forward, no
  merge commit) without running the suites again locally. If `main` moved meanwhile, rebase the
  branch and push it again (CI runs again). Then check the CI run of `main`.
- **`main` is protected** (repository rulesets): no deletion and no force push, for anyone; a commit
  reaches `main` only with CI's unit and UI checks green, the repository's admin excepted (for the
  release commit and documentation-only changes, whose pull requests skip CI). The weekly quality
  comparison cannot push to `main`: it pushes its results to the branch `quality-results`, which a
  maintainer merges.
- **CI** (`.github/workflows/ci.yml`) runs everything on every pull request and every push to main: unit tests on Linux,
  macOS and Windows, UI in both interfaces, Firefox and WebKit, the standalone build, the release zip.
  A docs-only push runs `docs.yml` only. The ISE tests (nightly) and the quality comparison against
  XST (weekly) run on a self-hosted runner, only when main changed since their last run.
- **CHANGELOG.md**: every change gets an item under the next, unreleased version's heading ("In
  short" for what users notice, "In detail" for each change with its issue number).
- **Releases**, only when asked:
  1. `npm version X --no-git-tag-version`, then `node scripts/sync-version.mjs`;
  2. commit `core/version.js`, `package.json`, `package-lock.json` and the CHANGELOG;
  3. tag `vX` and push; the Release workflow publishes it.

  The Pages site serves the latest release at the root and `main` under `dev/`.
