In short:

- **The logic analyzer in the interface:** under *Configure Target Device*, *Logic Analyzer Settings* chooses the
  signals to watch, the clock, the samples and the trigger; *Analyze Design Using the Logic Analyzer* captures them on
  the board and shows them in the waveform viewer, the cursor on the trigger; *View the Last Capture* shows it again.

In detail:

- **The logic analyzer's processes (#3176):** the Silinx toolchain's *Configure Target Device* gains *Analyze Design
  Using the Logic Analyzer* and its children *Logic Analyzer Settings* and *View the Last Capture* (`web/js/capture-ui.js`;
  not in ISE's, iCE40's or Vivado's trees). The settings' dialog checks what the MCP tool `capture_settings` checks
  (`core/ila-insert.js` planInsertion and captureCost), each problem below the fields and Save disabled while there is
  one, the block RAMs against the device's; saved in `silinx.json`. The capture runs as a job (`POST
  /api/projects/:p/capture`, `server/ila-board.js`; in the browser edition the board's WebUSB, `core/ila-link.js`
  adeptLink), its lines in the console, saved in `build/capture.json` (`captureRecord`, shared by both). Its window is
  the waveform viewer on the capture replayed (`core/ila-capture.js` replayBench): each probe a wave, one sample a
  period, the cursor and a marker on the trigger's sample. Portuguese labels. Tested in both interfaces against
  adepttool's stand-ins (`test/fixtures/adepttool-stub`, a simulated core's samples).
