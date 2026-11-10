In short:

- **Grading:** the Exercise document runs the synthesis tests too, with the same verdicts as `silinx grade`: in the
  browser editions in the page, and on the local server in a grading process.

In detail:

- **The synthesis tests in the interface (Fixes #3216, part of #3191):** before, the Exercise document showed them "not
  run".
  - core/grade-synth.js: a synthesis test's spec and numbers, moved from server/grade-synth.js, which uses them, and
    shared with the page.
  - web/js/grade-synth-browser.js: in the browser editions, the open synthesis in the flow's worker
    (web/js/open-flow-browser.js runBrowserSpec), with Place & Route for the slices and the test's time limit (a Time
    Limit Exceeded). Where Place & Route cannot run, the slices are not checked, and the messages say so.
  - The local server's page asks its server: server/grade-routes.js, `POST /api/projects/:name/grade/synthesis`, one
    synthesis test of the saved exercise graded on the saved project, in a grading process as `silinx grade`'s.
  - Tests: grade-routes (the spec, the numbers, the route's verdicts and refusals); UI exercise in both interfaces (AC,
    then RL after the teacher's edit); UI standalone-exercise (the site: the slices placed and routed in the worker,
    the verdicts and messages those of the server's grader on the same project).
