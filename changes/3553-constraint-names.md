In detail:

- **Constraints: a net named `__proto__`, `constructor` or `toString` (#3553).** Its constraints are its own, in every
  format: a constraints file with such a name no longer gives its pins to the designs implemented after it, nor loses
  them (the toolchain's changelog has the details).
