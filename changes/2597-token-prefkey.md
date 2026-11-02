In detail:

- **The server's token kept under a key made by prefKey (#2597):** web/js/api.js names its localStorage key as
  every other setting does (the same key in the application), so that the test of the settings' keys passes again.
