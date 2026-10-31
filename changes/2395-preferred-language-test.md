In detail:

- **The Preferred Language's UI test with the editors' new toolbars (#2395):** test/ui/preferred-language.test.js waited for the
  state diagram editor's Language select, which #2257 removed; it now waits for the editor itself and checks that the open
  editor follows the Preferred Language by its model (its language and its HDL file).
  - **Tests:** test/ui/preferred-language.test.js, in both interfaces.
