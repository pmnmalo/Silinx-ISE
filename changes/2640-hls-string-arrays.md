In short:

- Silinx HLS: an array of chars initialised from a string, `char b[] = "abc"`, has the string's chars and its `'\0'` in the C simulation (it had no elements) and in synthesis (it was refused: a string only in printf).

In detail:

- Silinx HLS: an array of chars (`char`, `signed char`, `unsigned char`, const, static, at file scope) initialised from a string, `char b[] = "abc"` or `{ "abc" }`, made a list of its chars and its `'\0'` by the parser (`core/c-parse.js`), its size the string's length and its `'\0'` when left out, as C's: in the C simulation it had no elements (`b[1]` outside the array, `sizeof b` 0), in synthesis it was refused; an array just the string's length keeps no `'\0'` (`char b[3] = "abc"`), a string longer than its array is an error (`core/c-check.js`); the C simulation runs `strlen` (#2640).
