In detail:

- **A UI test follows the text editors' bar (#2571):** test/ui/generated-hdl.test.js still expected Undo and Redo in an HDL
  editor's bar, which #2514 removed; the release CI of silinx-fpga-v0.2.0 failed on it. Test: test/ui/generated-hdl.test.js.
