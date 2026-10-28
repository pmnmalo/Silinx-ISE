In detail:

- **The classic interface's menu test within its budget again (#1861):** since File ▸ Print… is enabled with any
  document (#1509, 15.18.1), the test of every menu clicked it and opened the browser's print of a new window, which
  held it about 77 s: 85 s of its 90 s on CI, then over. Print is left to test/ui/print-docs.test.js, which tests it
  with every document; the menu test takes about 18 s again in the classic interface.
