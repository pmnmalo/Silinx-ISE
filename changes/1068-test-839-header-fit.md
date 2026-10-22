In detail:

- **The #839 UI test after the project chip's removal (#1068):** with no project chip (#1042) the Tasks header has more
  room, and at 1280 × 800 every label fits; `test/ui/tasks.test.js`'s #839 now looks for the width where only the
  current task's label shows (from 1280 down to 1040 px) rather than assuming 1280.
