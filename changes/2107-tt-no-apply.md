In short:

- The Boolean Algebra editor's Apply button is gone: the inputs' and outputs' names apply on leaving the field or on Enter.

In detail:

- **Boolean Algebra: no Apply button (#2107):** the toolbar's Apply of the input and output names duplicated what
  leaving the field (its change event) and Enter already did; the button and its two translations are removed, the
  errors shown as before. Tests: test/ui/truthtable.test.js (the names applied by Enter and by leaving the field,
  the errors, the toolbar's buttons in English and in Portuguese).
