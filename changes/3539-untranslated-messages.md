In short:

- **Portuguese:** a few messages, dialogs' titles and texts that stayed in English in Portuguese are translated: the
  Test Bench wizard's introductions and checks, Rename's errors, Replace Project, the iMPACT's "(no board / generic
  JTAG)", the console's empty tabs, Paste's hint, among others.

In detail:

- **The texts test/web-i18n.test.js did not scan (#3539):** its label scan also reads the texts of toasts, dialogs'
  titles and messages, plain elements (div, p, span, option… but those marked data-no-i18n), textContent and the
  sentence a dialog's check returns, so that a new one with no translation fails; the 31 it found untranslated get
  their Portuguese in web/js/i18n-messages.js. The console's "No messages." (a console page, which the DOM pass
  leaves alone) is translated where it is written. A UI test (test/ui/i18n-messages.test.js) in both languages.
