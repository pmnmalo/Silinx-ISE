In detail:

- **The 7-series' Vivado timing script: --filter takes examples' names (#3752).** `scripts/xc7-timing-vivado.mjs` built a
  regular expression from its --filter argument (CodeQL's js/regex-injection). It now takes names separated by `|` or
  `,`, in parentheses or not, with `^` and `$` as before (`^(blinky|pong)$` matches the same examples); anything else
  is an error naming the filter.
