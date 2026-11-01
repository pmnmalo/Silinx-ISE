In detail:

- **The tool descriptor (#2311):** a descriptor per back end (`web/js/tool-descriptors.js`: ISE, the Silinx toolchain on the
  Xilinx families and on the iCE40) gives its steps and what each produces, its reports, its constraints' format, how
  its messages are read and how a board is programmed; the process tree and the Tasks interface's task list are built
  from it. A function a tool does not have is absent, not disabled (`ISE_ONLY` and `forOpenMode` are gone). The interface
  stays as it was.
