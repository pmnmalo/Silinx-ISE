In detail:

- **One written rule for the shared ISE machine (#2328):** ONBOARDING.md's "Several Claude sessions at once" has a
  section of its own on the self-hosted runner "ise" (the ISE 14.7 and Vitis HLS / Vivado 2025.2 images): ask the
  maintainer first; at most two small ISE jobs at once (`docker ps` shows at most one running before another);
  Vitis HLS, Vivado, the weekly quality comparison and large Spartan-6 runs alone; one design at a time in scripted
  runs; the ssh user and host read at run time from the local configuration and never written anywhere; the remote
  folder under the folder Docker shares; agents prepare the command and the maintainer runs it.
