In short:

- **Try it out's buses:** the Buses list no longer has a plain Binary (Binary (Unsigned) already shows the bits),
  and Binary (Unsigned) is the default; a Binary chosen before reads as Binary (Unsigned).

In detail:

- **Try it out's bus formats without plain Binary, Binary (Unsigned) by default (#2160):** the bar's Buses list is
  Hex, Binary (Unsigned), Binary (Two's Complement) and Binary (One's Complement); nothing saved, or the removed
  Binary saved, gives Binary (Unsigned). The bus editor's own typing formats and the simulator's radixes are as
  they were.
