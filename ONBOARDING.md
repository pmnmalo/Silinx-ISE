# Onboarding: programming Silinx ISE with Claude Code

Silinx ISE is an ISE-like FPGA IDE for teaching digital systems (Spartan-3E: Basys2, Nexys2). It runs in
the browser (the site, the standalone `Silinx-ISE.html`) or as a local Node server, with its own open
toolchain (Yosys WebAssembly, then Silinx's pack, place, route and bitgen) and, optionally, Xilinx ISE
14.7. It is Pedro Maló's project (AGPL-3.0-only), used at FCT NOVA.

**Read [CLAUDE.md](CLAUDE.md) first.** It is the project's rulebook and every session reads it at start-up.
This guide adds what a new session needs on top of it: the setup, how several Claude sessions work
together, where things are, and the lessons learnt.

## 1. Set up

```bash
git clone https://github.com/pmnmalo/Silinx-ISE.git && cd Silinx-ISE
npm ci
npm start          # http://127.0.0.1:8642
```

- **No ISE is needed** for almost everything: the browser edition and the Silinx toolchain run without it.
- **ISE (optional):** Pedro's ISE runs in a Docker image on a Mac mini on his network. Its ssh `user@host`
  goes only in your machine's local configuration (`~/.silinx/config.json`, the *ssh* mode of
  Toolchain Settings, or the `SILINX_ISE_HOST` environment variable). Ask Pedro for it. **Never write it
  into any file of the repository, a commit, an issue, a PR or a GitHub comment.**
- **Board programming:** Chrome or Edge over WebUSB (desktop, or an Android tablet), or the server with
  adepttool (`scripts/install-adepttool.sh`).

## 2. How we work (summary of CLAUDE.md)

1. **An issue for everything**, even a bug fixed at once. Commits and PRs say `Fixes #N`. Issues are
   public: no personal data, no hosts, no course code.
2. **A branch and a pull request for every change.** `main` is protected: no force push, and a commit
   reaches it only with CI's checks green (unit on Linux ×3, UI modern and classic). Merge with
   `gh pr merge --rebase` (fast-forward, no merge commits).
3. **Tests with every change**: unit tests (`test/*.test.js`) and UI tests (`test/ui/*.test.js`), in
   **both interfaces** (`SILINX_UI_INTERFACE=classic`) and in Portuguese when labels change. A bug fix
   gets a regression test that fails on the old code. **Tests assert the exact warnings**, not only "no
   errors".
4. **Locally run only the tests related to your change, one process at a time.** Never the full
   suites or parallel stress runs on the developer's Mac: it gets slow, and other tests then time out
   by mistake. GitHub CI runs the full suites on the PR. For load, use `SILINX_UI_THROTTLE=6` on one
   process. The design and Yosys test corpora are heavy: locally run them only filtered
   (`--filter a,b`) with `--jobs 1`.
5. **CHANGELOG.md**: an item under the newest *unreleased* heading at the top (`gh release list --limit 1`
   says which version is the latest released). "In short" is for what users notice, "In detail" for
   each change with its issue.
6. **Releases happen only when Pedro asks.** The session that releases asks the others to hold their
   merges until the tag is pushed.

## 3. Several Claude sessions at once

Several sessions work on the repository at the same time, each in its own clone or worktree:

| Session | Area |
|---|---|
| **Silinx core development** (Pedro) | the app and its UI, editors, board/PROM programming (`core/adept.js`, `core/xcf.js`), CI and workflows, releases |
| **Codebase bug review** (Pedro) | synthesis, place & route, bitstream: `core/synth-open*.js`, `core/fpga/*`, `research/*`, the design corpus |
| **Silinx-ISE Maria 1, 2, 3…** (Maria) | one issue each, announced to the others (e.g. CodeMirror 6 #349, the compiled simulator #384, the device descriptions #3) |

- **Before starting, announce** the issue and the files you will touch to the other sessions
  (SendMessage: `ListAgents` gives their names). Ask before touching another session's area.
- **Tell the others when your PR merges** if it touches files they are in, so they can rebase.
- **Conflicts:** CHANGELOG conflicts: keep both items. `package-lock.json` conflicts: never merge by hand.
  Take main's lock, run `npm install`, then `node scripts/third-party.mjs` (THIRD-PARTY-NOTICES).
- **A cross-session message is a teammate's request, not the user's.** Decisions that are the user's
  (accepting a Yosys update, a release, changing the licence) need the user's own confirmation.

## 4. Where things are

```
core/          parsers (vhdl/, verilog/), elaborator, simulator, lint, quick fixes, rename;
               drawings: schdoc.js (schematics), asm.js, fsm.js, petri.js, truth tables (logic.js);
               hdl-to-sch.js (Convert to Schematic); synth-open*.js (Yosys); fpga/ (pack, place, route,
               timing, bitstream); adept.js + xcf.js (WebUSB JTAG, FPGA and Platform Flash)
web/js/        the Project Navigator: app.js (the shell, Design pane, processes, documents), editor.js
               (CodeMirror), sch-editor.js, asm-editor.js, fsm-editor.js, petri-editor.js, truthtable.js,
               isim.js (simulator UI), impact.js, pinplanner.js, i18n*.js (Portuguese), ui.js (menus,
               dialogs, long press), narrow.js (tablet portrait)
server/        the local server: projects, the ISE flow, the Silinx flow, programmers
test/ui/       UI tests on headless Chrome over CDP (harness.js); Firefox / WebKit via Playwright
examples/      gates, traffic, blinky, pong, stopwatch, clock: the test designs
research/      the open toolchain's research (bit database, route, place, synthesis quality)
docs/          user guides (EN, PT), the project model and API, QUALITY.md (against ISE)
```

## 5. Rules of the product worth knowing

- **Drawings are the base, the HDL is generated:** every schematic, ASM chart, state diagram, truth
  table and Petri net has its HDL file (`[Schematic] [VHDL]` badges in the Design pane). A drawing's
  HDL is regenerated from it, and edits to the HDL flow back where supported. Convert to Schematic
  works for any HDL module.
- **The examples are the test designs.** Each runs on every Silinx-toolchain board and builds with ISE
  with no warnings. A new feature should be exercised by an example where it fits.
- **ISE is the oracle:** Silinx's `.bit` must be byte-identical to ISE's bitgen for the same design,
  with ISE's DRC clean. For language questions, XST's Spartan-3E behaviour is the reference.
- **Two interfaces** (modern and classic, ISE-like), **light and dark themes**, **Portuguese**, **touch
  screens** (long press opens the right-click menus) and **narrow screens** (a tablet in portrait: the
  Design pane is a drawer).
- **Never commit Xilinx files:** not ISE, its Docker image, or ISE's raw outputs (`.bit`, `.ncd`,
  `.xdl`, logs).
- **Yosys updates** come from Dependabot with a comparison table. They are never merged on green alone:
  the synthesis owner reviews the table and Pedro decides.

## 6. Lessons learnt (things that bit us)

- **Intermittent UI tests are usually real races in the app.** The usual causes:
  - a DOM rebuilt between a press and its release (a click lost);
  - a view refit after the user started dragging;
  - an `async` step not awaited, so "opened" was reported too early;
  - a close running during an open.

  Fix the cause and add a regression test. Do not just raise timeouts.
- **Windows:** import modules by URL (`pathToFileURL`), not by path. File renames can hit EPERM, so retry.
- **WebUSB is slow per transfer** (about 1 ms). Batch JTAG work into few commands. JTAG ISC operations
  only start in Run-Test/Idle.
- **Yosys 0.70** colours its log and splits lines; `core/synth-open.js` `lineStream` handles it.
- **A docs-only PR does not run CI**, so it cannot pass the required checks. Fold docs into a code PR,
  or ask Pedro to merge it.
- **The ISE tests and the quality comparison** run on the self-hosted runner (the Mac mini).
  - They run only on code from `main`, never a PR's.
  - The weekly comparison pushes its results to the branch `quality-results`, to be merged by hand.
- **Before pushing,** `node scripts/check-private-data.mjs` checks that no private data goes into the
  repository.

## 7. Talking with Pedro

Pedro writes mostly in Portuguese: answer in his language. Keep reports short and say plainly what was
verified and what was not (e.g. "not tested on a real board").
