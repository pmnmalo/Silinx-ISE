In detail:

- **The compiled engine's speed test on CI (#909):** `test/compiled-words.test.js`'s #670 speed check compares two
  wall-clock measurements, which on a shared CI runner vary with its load (6 against 5, then 4 against 4 million
  cycles a second on the 15.12.0 release CI). On CI the ratio is now reported, not checked; it is still checked on a
  developer's machine, and the work the activity saves is checked everywhere, deterministically.
