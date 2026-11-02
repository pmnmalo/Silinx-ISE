In short:

- **Silinx HLS, arrays of arrays' initial values:** a row given in part (`int m[2][3] = { { 1, 2 }, { 3 } };`) has
  the rest of its values zero, as in C, in the C simulation and in synthesis's memories; it no longer takes the next
  row's values. A string initializes a row of an array of `char`s.

In detail:

- **An array of arrays' initializer by C's rules (#2185):** core/c-designated.js writes in full the initializer of an
  array of arrays that has a list or a string in it, or whose first size is `[]`: each row's missing values zero, its
  inner braces left out or mixed, a string a row of characters (one longer than its row said), the size `[]` the
  number of rows written. Before, its values were taken in order with no padding, so a row given in part moved the
  next rows, in the C simulation and in the ROMs and RAMs made of it; `int w[][3] = { 1, 2, 3, 4 }` had 4 rows, not
  2. For the elements of `ap_int`, `ap_uint`, `ap_fixed`, a typedef's or a `using`'s name, a struct and a typedef of
  an array's row; a list of a type not known there (a class's, `std::complex`) is left as it is.
