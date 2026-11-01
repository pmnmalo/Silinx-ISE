In detail:
- **The UI tests' page load (#2497):** when the load event does not come, the harness's `goto` / `reload` name the requests the page still waits for (URL, type, for how long), in the error and in the log. The wait is now 45 s, up from 30 s, and is awaited together with the navigation, so a failed navigation leaves no rejection behind.
