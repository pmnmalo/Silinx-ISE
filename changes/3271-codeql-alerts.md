In detail:

- **CodeQL's open alerts reviewed (#3271, #3171, #3278, #3280, #3279):** the timing paths' reading of the synthesis
  Verilog and the comparisons' step of the open synthesis in linear time on any input (two quadratic regular
  expressions), and a name built into a regular expression escaped in full (the timing paths' synthesis file, Vivado's
  configuration properties); the alerts in the tests fixed the same way (a text escaped in full, a URL's host compared
  as a whole: #3272, #3276, #3277, #3100–#3104). The project folder's paths (#3172, #3273–#3275) were already confined to
  the workspace (a project's name is checked before it is made a path, a template's file kept in its project): a test
  proves it, the alerts dismissed as false positives.
