In detail:

- **The local server's project paths: their containment where CodeQL sees it (#3648-#3661).** CodeQL's js/path-injection
  alerts on server/projects.js and server/fs-error.js were false positives: every path is the project's folder (the
  name checked against the project name's rule) or a path that safeJoin keeps inside it. Since #3538 the name's check
  is a function of core/project-name.js, which the analysis does not follow. projectDir now also checks that the
  resolved folder is inside the workspace, and safeJoin that the resolved path starts with the project's folder, before
  server/paths.js's check through symbolic links; a file's trash folder is named after the project's folder. No
  change of behaviour; a test shows every file route refusing a path out of the project.
