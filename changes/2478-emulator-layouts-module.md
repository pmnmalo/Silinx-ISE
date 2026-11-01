In detail:
- The Board Emulator's board drawings in modules of their own, out of `web/js/emulator.js` as they were: `web/js/emulator-layouts.js` (`BOARD_LAYOUTS`, still exported by `emulator.js`), one module per board (`emulator-basys2.js`, `emulator-nexys2.js`, `emulator-s3e.js`) and their drawing helpers (`emulator-pcb.js`), before each board is drawn as the real one (#405, #2478).
