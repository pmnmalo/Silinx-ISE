In detail:

- CST and LPF (#3663, #3664, #3665, #3666, #3667): their readers' regular expressions in linear time on a long line
  (CodeQL's js/polynomial-redos): '.' with the s flag, the CST clock comment's end with no two `\s*` in a row. The same
  model as before; a line's comment followed by a lone carriage return now ends at the line's end.
- CST and LPF (#3670): a statement with no keyword (`"a" 1;`) throws the readers' own message naming its line, not a
  TypeError.
