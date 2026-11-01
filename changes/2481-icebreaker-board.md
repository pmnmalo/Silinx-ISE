In short:
- The Board Emulator draws the iCEBreaker as the real board: PMOD1A, +5V and PMOD1B along the top, PMOD2 on the right edge with the snap-off part plugged into it (LED1 among LED2..LED5, Button 1..3), the USB and the user button on the left. It runs a design on it once it reads the iCE40's PCF (#2511).

In detail:
- The iCEBreaker's layout (`web/js/emulator-icebreaker.js`), after the board's annotated top view: the main board 712 x 493 and its snap-off part; the FPGA turned a quarter, the flash, CDONE, CRESET, the FLASH header, the RGB LED, the green and red LEDs; the board's name, not its makers' names or logos. The board has no power switch (the USB powers it): the emulator's is drawn by the USB, its LED the PWR LED (#2481).
