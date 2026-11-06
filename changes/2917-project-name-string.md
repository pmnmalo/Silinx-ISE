In detail:

- **A project name that is not a string is refused (#2917):** the local server's `projectDir` refuses a name that is
  not a string (an array, a number in a request's JSON) as an invalid project name (400), where an array of one
  valid name passed the name's check and failed later (500); CodeQL now sees the check that confines a project's
  folder to the workspace.
