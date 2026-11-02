In short:

- The toolbar's Undo and Redo follow the document in front at once: just after a drawing opened, they were greyed
  out for up to a second, and an Undo clicked then was lost.

In detail:

- **The toolbar's buttons refreshed when a document is opened or brought to the front (#2589):** their state (Undo,
  Redo, Print, Cut / Copy / Paste) was refreshed only after a click or a key, on a timer, and every second; a
  document opened without a click (a drawing opened by the application) kept them as the previous document had them,
  and a click on the greyed-out Undo did nothing. The FSM editor's parts test (#405) failed so now and then in the
  release's CI, its Undo clicked a moment after Arrange. Test: test/ui/fsm-parts.test.js (Undo enabled as soon as the
  editor opens).
