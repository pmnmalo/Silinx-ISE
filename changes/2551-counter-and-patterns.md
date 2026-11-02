In short:

- **The published site never counts a project's name:** its usage count has a fixed title and no referrer.

In detail:

- **The counter and name patterns (#2551):** GoatCounter with a fixed title and no referrer, as web/js/analytics.js promises; the
  PCF check finds a name without a RegExp built from it; `.gitignore` covers keys and bitstreams; a test without a RegExp of a
  version (Fixes #2318).
