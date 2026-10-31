In short:

- **C Simulation and C/RTL Co-simulation in the modern interface:** their results are shown in the Console; they ran,
  but the Console's filter hid every line, so the buttons seemed not to work.

In detail:

- **The C commands' lines in the Edit task (#2262):** C Simulation, C/RTL Co-simulation and View C Synthesis Report turn
  the Console's filter to their source (Simulation, Implementation) when it hides it, also a filter following the task:
  the Edit task's shows Design's lines only, and since #1867 a process started left it as it was. Other processes
  started keep the task's filter.
