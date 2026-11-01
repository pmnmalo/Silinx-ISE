In detail:

- **The interfaces' ids: silinx and ise (#2451):** the ids `modern` and `classic` became `silinx` and `ise`
  everywhere: `INTERFACES` (web/js/modern.js), `data-ui` and its CSS selectors, the saved preference, the UI
  tests' `SILINX_UI_INTERFACE` and CI's matrix of the UI tests (and the names of their times' artifacts). A
  preference saved with an old id is migrated once on load (`LEGACY_INTERFACES`; web/index.html's early script
  too, before the first paint), so a viewer's choice is kept. `SILINX_UI_INTERFACE=modern|classic` is still
  accepted for a transition, mapped with a warning (test/ui/interface.js); a value that is no interface is an
  error. A test finds any old id left in the code, the tests, the scripts and the workflows. Nothing visible
  changes: the labels and the documentation follow.
