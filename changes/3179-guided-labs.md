In short:

- **Guided labs:** Project ▸ Guided Labs… opens a step-by-step tutorial on the project, and Silinx checks each step on
  it: Check Step ticks the step when its action is done, and gives its hint when it is not. The first one, "First
  steps" on the gates example (in English and Portuguese), goes through Check Syntax, the simulation, a new output and
  its pin. A lab resumes where it was left.

In detail:

- **Guided labs, the runner and the first lab (#3179):** a lab is a JSON file (`*.lab.json`: its texts in English and
  Portuguese, its steps, each with its text, its hint and its checks), shipped with Silinx (`core/labs-shipped.js`,
  each for an example) or a teacher's, in a project's `labs/` folder (shared with the project). A step's checks
  (`core/labs-check.js`): the project's settings, a file and its text, a module's ports, Check Syntax with exactly the
  given warnings, a simulation's values at given times and its messages; the progress is the project's
  `labs/progress.json`. The lab opens as a document: its toolbar (Check Step, Previous, Next, ☰ Steps, ⋮ Restart the
  Lab), the step shown, a foldable Steps panel with each step's tick (over the page on a narrow screen), its status line,
  every check's result in the console. The MCP server's `lab` tool lists the labs, shows a step, checks it and restarts
  a lab, through the same checks.
