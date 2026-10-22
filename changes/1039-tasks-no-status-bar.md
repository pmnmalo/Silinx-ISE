In short:

- **The Tasks interface without the status bar:** its bottom line (the last message, the device and board, the
  storage) is gone; the messages are in the message centre, the device and board in Design.

In detail:

- **Tasks: no status bar (#1039):** `web/css/tasks.css` hides `#statusbar` under `data-layout="tasks"`; the
  modern and classic interfaces keep it. Test: `test/ui/tasks.test.js` (hidden in Tasks, shown in modern before
  and after).
