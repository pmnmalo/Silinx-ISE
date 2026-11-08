In detail:

- **The project's old name counted (#2624, part of the rename to Silinx):** `test/old-name.test.js` counts the old
  name (Silinx followed by ISE, in its four spellings) file by file as a ratchet: a new file with it, or a file
  whose count grew, fails, and a count that shrinks is lowered in the test's list until the list is empty. Xilinx
  ISE's own names (the ISE host's environment variables, its shared folder) and the changelogs' history are not
  counted.
