In detail:

- **The steps by family (#2387):** a back end lists its steps (`steps: [{ id, label, needs }]`) and its mount gives their
  functions (`{ steps: { id: run() } }`, in place of `runMap`, `runPar`, `runTiming`, `runPins`, `runPower`, `bitfile` and
  `runFpgaView`); `runFlow` runs the steps asked in the list's order, the synthesis and the simulation models its own, and
  names no other step. The Xilinx families keep ISE's steps, names and labels (`XILINX_STEPS`), so the IDE's processes do not
  change; `orderSteps(list, asked)` gives a run's steps from any list. A fake family runs `synth, pnr, timing, bitstream` in
  the tests; the Spartan-3E and Spartan-6 give the same output.
