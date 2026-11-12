In detail:

- **The code-size test measures every function (#3542):** test/code-size.test.js found a function only by a
  declaration at the start of a line (`function f(…) {`), so an arrow function, a function expression, a class's or an
  object's method, getter or setter, or a nested function over 300 lines passed. Its measure (test/code-size-lib.mjs)
  now reads the source's tokens (comments, strings, template literals and regular expressions skipped), pairs its
  brackets and measures every function, each nested one on its own too, from its first line to its last; it no longer
  takes a function in a template literal's generated code for one of the module's, nor a one-line function as running
  to the next closing brace. No function of the repository is over the limit with it (the largest have 300 lines), so
  no entry joined the list of known ones. Tests: test/code-size.test.js (every form of function measured, a nested one
  and a one-line arrow function, strings, templates, regular expressions, comments and statements not taken for
  functions, a 301-line arrow function, function expression and method caught).
