In detail:

- **The tablet tests in Firefox and WebKit (#2038):** the UI tests of #1985, #1990 and #1992 send their touches through
  the Chrome DevTools Protocol: Chrome only (skipped in the other browsers, as the other CDP tests).
