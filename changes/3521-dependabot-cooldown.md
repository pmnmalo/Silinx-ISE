In detail:

- **Dependabot: a week's cooldown for the GitHub Actions and the Docker image too (#3521):** an action's release and
  the Vitis HLS image's base digest are proposed a week after they are published, as an npm version is (#1436);
  `test/workflows.test.js` checks every ecosystem's cooldown; SECURITY.md says so.
