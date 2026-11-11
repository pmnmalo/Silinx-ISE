In detail:

- **The import gate and the .xise reader take linear time on an unclosed XML construct (#3406):** the gate's XML depth
  (`core/import-gate.js`) and the .xise reader's comments, `<file>`, `<association>` and `<property>` elements and their
  attributes (`server/xise.js`) are linear scans (each terminator searched once with `indexOf`, one not found not
  searched again), where regular expressions took quadratic time: an unclosed tag, comment, CDATA section or
  `<property a="` repeated in a few MB froze the server for minutes. The results are the regular expressions' own (an
  unclosed construct skipped as before), the same on the repository's XML files and on 50,000 random inputs. Tests:
  import-linear (each construct at 3 MB within a bound, in a worker; the unclosed constructs read as before).
