In short:
- The Board Emulator runs a design on the iCEBreaker: its pins from the project's PCF, the user button BTN_N (active low) released at rest and low while pressed, the red and green LEDs lit, LED1 and the red LED drawn red.

In detail:
- Emulate and Program FPGA read a PCF's pins as a UCF's before saying "Pins not set" (`placesPins` in `web/js/pins-check.js`, with the project's device); the emulator already wired the PCF's pins (#2511).
- An active-low button or switch (`extra.activeLow`, the iCEBreaker's BTN_N) rests high and is driven low while pressed or on (`web/js/emulator.js`, `web/js/emulator-board.js`), as the outputs already were (#2511).
- The LED resources besides `led` (the iCEBreaker's LEDR_N and LEDG_N) are LEDs of the emulator, numbered after LED1..LEDn (`ledNumbers` in `core/emulate.js`), no longer "not emulated"; an LED may be drawn red (`data-colour`, `web/js/emulator-paint.js`) (#2511).
