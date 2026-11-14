In detail:

- **The Classroom template's text in `core/` (#3841, part of #3191):** the workflow's and the README's text
  (`workflowYaml`, `readmeText`, `CHECKOUT`, `SETUP_NODE`, `WORKFLOW`) moved as it was from `server/classroom.js` to
  `core/classroom-template.js`, so the browser editions can make the template too. `server/classroom.js` exports the
  same names. Tests: classroom-template (the old module's names, the workflow, the README), classroom.
