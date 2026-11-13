In short:

- **Messages in the console, not in toasts:** "Another operation is running", "An implementation is already
  running", a menu command's error, Rename Symbol's refusals, "Cannot save the stimuli", an Auto-assign from Board
  that assigns nothing and the commands that do nothing ("No process is running", "Open a project first", "No quick
  fix here."…) are lines of the console (`ERROR:`, `WARNING:` or `INFO:`), the Errors or Warnings tab in front, in
  the interface's language; a toast only says an action was done.

In detail:

- **The toasts that were messages moved to the console (#3591):** `logWarning` and `logInfo` beside `logError` in
  `web/js/console.js` (each translated, its tab or the console's page in front); the busy refusals of iMPACT,
  Program Flash, Implement Design and the processes, "The design is being implemented", a failed programming's
  "Failed — see console" (its ERROR line instead), Rename Symbol's refusals, the stimuli's save error, Verify's "no
  other module to be the reference", the top's choice with no module, a disabled process's reason, Stop with nothing
  running, Find in Project with no project, Select the top module first, Paste without the clipboard, and the pin
  planner's Auto-assign that assigns nothing (a WARNING); a menu action's error and the editor's "No quick fix
  here." through `ui.js`'s `message`, which the app sends to the console (`setMessageSink`). `test/web-toasts.test.js`
  checks that no toast of kind error or warning is left; the i18n scan reads the console's messages too; UI tests in
  `test/ui/console-messages.test.js`.
