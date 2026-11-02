In detail:

- **UCF wildcards in linear time (#2551):** `ucfPattern` matches with two pointers instead of a backtracking RegExp, whose time
  on a name such as `a*a*a*…b` was exponential (Fixes #2319).
