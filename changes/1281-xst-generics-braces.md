In detail:

- **XST options: a list in braces (#1281):** since #1244, an `impl.xstOptions` value with a space was refused, and
  so was XST's `-generics {DIV=2 DEBOUNCE=2}`, the ISE timing simulation test's (test/ise/timesim.test.js). A value is
  one word or a list in braces with no brace, quote or line break inside (server/ise.js).
