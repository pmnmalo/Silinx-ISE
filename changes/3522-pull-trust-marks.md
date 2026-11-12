In short:

- Security: a pull into the workspace's repository marks every project it brings as untrusted, also when it brings a
  folder whose name is no project's (#3522).

In detail:

- Git pull, the workspace's repository (#3522): a folder with a `silinx.json` whose name is no valid project name is no
  project (`listProjects` leaves it out, as every route refused it already), and the projects a pull brings are marked
  untrusted each on its own (`server/git.js` `broughtUntrusted`): one that cannot be marked is the pull's error, naming
  it, after the others were marked. Before, such a folder ended the marking with "invalid project name", and the
  projects listed after it stayed trusted: Xilinx ISE and the board programming were not refused for them.
