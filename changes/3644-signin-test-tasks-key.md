In detail:

- **The standalone Sign in with GitHub… test no longer fails at times (#3644).** It compared localStorage's keys before
  and after the sign-in, and the tasks' arrangement, kept whenever a document comes to the front, was at times written
  in between; it now leaves that key out.
