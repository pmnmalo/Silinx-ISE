In short:

- **Program FPGA implements first:** with no programming file yet, or one older than the sources, Program FPGA asks
  whether to implement the design first, and programs the board once it is built. The Tasks interface's Program no
  longer has the lines "No programming file yet — Implement" and "Up to date with the sources".

In detail:

- **Program FPGA with no programming file, or an old one: implement first (#1024):** in every interface, Program FPGA
  with the project's own programming file not built, older than the sources, or from an implementation that failed
  asks whether to implement the design first (Yes / No); Yes runs Generate Programming File, then programs the FPGA
  when it ends without errors, as Generate and Simulate does (#490); No programs nothing. A .bit file of the
  student's choice is programmed as it is. The Tasks interface's line about the file's state (and its Implement
  button) is removed. The file's state comes from the implementation processes' (web/js/impact-file.js, unit
  tested); UI tests in the three interfaces and in Portuguese, the programmer stood in for.
