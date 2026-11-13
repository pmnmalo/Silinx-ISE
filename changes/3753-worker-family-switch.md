In detail:

- **The browser's flow worker: a family's own tools chosen by comparing its name (#3753).** The worker looked up the
  family's tools (the iCE40's, the ECP5's, the Gowin's) in a Map by the name the page sent (CodeQL's
  js/unvalidated-dynamic-method-call, still after #3662); it now compares the name with those three, and any other
  family is the same error naming it.
