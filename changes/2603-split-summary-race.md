In detail:

- **Tests: the split view's UI test waits for the Design Summary opened with the project (#2603):** opened in the
  background, it could come after the test bench opened at once, and the empty side's picks in the other order;
  the picks expected by interface (the Tasks interface has no Design Summary among Design's documents).
