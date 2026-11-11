In short:

- **Git keeps a project's untrusted state:** a project from outside, or one an assistant made, stays untrusted after a
  Pull, whatever the pulled description says; only Trust Project trusts it.

In detail:

- **Git operations keep a project's untrusted state (part of #2830):** an untrusted project put in a repository (Initialize
  Repository, `git_init`, or before a pull) keeps its mark in the repository's `.git`, never in what git tracks
  (`server/projects.js` keepTrustInRepo), as a clone's already was; a pull never trusts it, and a project a pull brings
  into the workspace's repository is untrusted; a mark that cannot be read is an untrusted one. Xilinx ISE and
  programming stay refused (the interface's and the MCP's) until the user trusts the project.
