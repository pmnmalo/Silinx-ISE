In detail:

- **Constraints: a net named as an inherited property is a name as any other (#3553).** The constraints' readers (UCF,
  XDC, PCF, LPF, CST), portAssignments and boardAutoAssign kept a net's attributes in a plain object by its name: a net
  named `__proto__` was read as the object's prototype, so its attributes went to every later constraint read in the
  process, and the other formats lost that port's constraints; a timing name `constructor` or `toString` became a clock
  whose net was a function. A name is now read and written as an own property only (`byName`, `setByName` in ucf.js)
  and the timing names are a Map: such a net keeps its own constraints, round trips through the writers, and nothing
  of it reaches another file.
