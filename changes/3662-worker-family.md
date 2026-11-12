In detail:

- **The browser's flow worker: a family's own tools looked up among its own only (#3662).** The worker took the
  family's tools (the iCE40's, the ECP5's, the Gowin's) from an object by the name the page sent: a name of an object's
  own (constructor) ran another function and the flow went on without them; another name failed with a TypeError
  (CodeQL's js/unvalidated-dynamic-method-call). Now a Map, and a family with no tools of its own in the browser is an
  error naming it.
